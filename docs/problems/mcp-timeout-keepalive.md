# MCP タイムアウト: Node.js keepAliveTimeout 問題

## 概要

MCP `execute_code` ツール呼び出しが60秒タイムアウトする間欠的な問題。
サーバー側では全タスクがミリ秒で正常完了しており、HTTP レスポンスの返却経路で消失していた。

## 再現条件

- Streamable HTTP 接続（`type: "http"`）で MCP サーバーに接続
- Docker コンテナ内で MCP サーバーを実行
- ツール呼び出し間隔が **5秒以上**（デフォルト `keepAliveTimeout`）
- 一度発生すると `/mcp` 再接続まで全呼び出しがタイムアウト

## 観測されたタイムライン

| 時刻 | 操作 | サーバー処理時間 | Claude Code 受信 |
|------|------|-----------------|-----------------|
| 11:12:27 | penpot-init.js | 5ms | OK |
| 11:12:32 | tokens クエリ | 3ms (error) | OK |
| 11:12:35 | tokens なしリトライ | 4ms | OK |
| 11:12:47 | ボード作成 | 59ms | **TIMEOUT (60s)** |
| 11:13:50 | 状態確認 | 3ms | **TIMEOUT (60s)** |
| — `/mcp` 再接続後 — | | | |
| 11:19:42〜 | 以降全呼び出し | 3-362ms | OK |

呼び出し3→4 の間隔は **12秒**。デフォルトの `keepAliveTimeout`（5秒）を超過。

## 根本原因

**Node.js HTTP サーバーの `keepAliveTimeout` デフォルト値 = 5000ms（5秒）**

```
keepAliveTimeout: 5000   ← idle 接続を5秒後に close
headersTimeout:   60000
requestTimeout:   300000
timeout:          0
```

### メカニズム

1. 呼び出し 1〜3 で HTTP keep-alive TCP 接続が確立される
2. 12秒の空白中にサーバーが idle 接続を close（TCP FIN 送信）
3. Docker userland proxy 経由の TCP FIN リレーでタイミング問題が発生
4. クライアントが新リクエストを送信 → Docker proxy が新規接続としてサーバーに転送 → リクエスト到達
5. サーバーが SSE Response を返却 → Docker proxy が古いクライアント側コネクション状態と不整合 → レスポンス消失
6. サーバーは `enqueue()` 成功（TCP バッファへの書き込みは成功） → エラーログなし
7. クライアントは 60秒待ってタイムアウト

### 除外した仮説

- **tokens エラーの副作用**: エラー自体は正常に返却されており、サーバー側に異常なし
- **タイムアウトするコード実行**: 全タスクがミリ秒で完了
- **WebSocket 切断**: プラグイン↔MCP サーバー間の接続は維持されたまま
- **別 SSE 通知チャネルの切断**: Streamable HTTP では各 POST が独自ストリームを持つため該当しない

## 修正

### パッチファイル: `patches/mcp-keepalive.cjs`

Node.js `http.Server.prototype.listen` をモンキーパッチして `keepAliveTimeout` を引き上げ。

```js
// NODE_OPTIONS="-r /app/mcp-keepalive.cjs" で読み込み
const http = require('http');
const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.keepAliveTimeout = 65000;  // 65s (> MCP_TOOL_TIMEOUT 60s)
  this.headersTimeout = 70000;    // 70s (> keepAliveTimeout)
  return origListen.apply(this, args);
};
```

### docker-compose.yml の変更

`penpot-mcp-claude` と `penpot-mcp-copilot` の両サービスに追加:

```yaml
volumes:
  - ./patches/mcp-keepalive.cjs:/app/mcp-keepalive.cjs:ro
environment:
  NODE_OPTIONS: "-r /app/mcp-keepalive.cjs"
```

### 値の選定理由

| 設定 | 値 | 理由 |
|------|-----|------|
| keepAliveTimeout | 65000ms | MCP_TOOL_TIMEOUT (60s) より長く、ツール実行中に接続が切れないようにする |
| headersTimeout | 70000ms | keepAliveTimeout + 5s（Node.js の要件: headersTimeout > keepAliveTimeout） |

## 検証手順

1. `penpot-manage.sh build` でリビルド（不要 — volumes マウントのためリビルド不要）
2. `penpot-manage.sh up` で再起動（`--force-recreate` で新設定を反映）
3. `/mcp` で再接続
4. `execute_code` で接続確認
5. **15秒以上間隔を空けて** 再度 `execute_code` → タイムアウトしないことを確認
6. keepAliveTimeout 値の確認:
   ```bash
   docker exec penpot-penpot-mcp-claude-1 node -e \
     "const s = require('http').createServer(); s.listen(0, () => { console.log(s.keepAliveTimeout); s.close(); })"
   ```

## 日付

2026-02-14
