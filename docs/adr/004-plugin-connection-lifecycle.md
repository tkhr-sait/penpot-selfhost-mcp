# ADR-004: プラグイン接続ライフサイクル管理

## Status

Accepted

## Scope

本 ADR は **mcp-connect（Playwright）→ socat → Penpot backend 間の WebSocket セッション管理**をカバーする。

[ADR-003](./003-mcp-proxy-gate.md) は AI → proxy → MCP Server 間の接続管理（stdio プロキシ層）を扱っており、本 ADR とは対象レイヤーが異なる。ただし proxy-server.mjs の `upstream.close` 漏れは本 ADR のゴーストセッション問題と密接に関連するため、Fix 5 として含める。

```
AI ──(stdio)──> [Proxy MCP]  ←── ADR-003 のスコープ
                    │
                (HTTP/SSE)
                    │
                    ▼
              [penpot-official MCP]
                    │
                (WebSocket)
                    │
                    ▼
              [Plugin iframe]
                    │                ┐
              (Plugin API)           │
                    │                ├── ADR-004 のスコープ（本文書）
                    ▼                │
[mcp-connect] ──(Playwright)──> [Browser] ──(socat)──> [Penpot backend]
                                                        │
                                                   (WebSocket)
                                                        ┘
```

## Context

mcp-connect.mjs がヘッドレスブラウザ経由で Penpot プラグインを接続・維持する構成において、5 つの問題が発生していた:

### 問題 1: page.reload() によるゴーストセッション蓄積

再接続 Strategy 2 で `page.reload()` を使用していたが、リロードは古い WebSocket を明示的に閉じないまま新しいページを読み込む。Penpot backend 側では旧セッションが TCP タイムアウトまで残存し、ゴーストセッションが蓄積する。

### 問題 2: コンテナ再起動時のセッション残存

`docker stop` / SIGTERM 時にブラウザを即座に閉じると、Penpot backend への WebSocket が FIN なしで切断される。backend 側で TCP タイムアウト（通常数分〜数十分）まで古いセッションが残り、リソースを消費する。

### 問題 3: socat の TCP keepalive 未設定

socat プロキシ（ポート 9001, 4402）に TCP keepalive が設定されておらず、idle 接続が中間ネットワーク機器やカーネルのデフォルトタイムアウトで無警告に切断される可能性があった。

### 問題 4: proxy-server.mjs の upstream.close 漏れ

プロキシ層で上流 MCP が切断された際、`upstream` 変数を `null` にするだけで `upstream.close()` を呼んでいなかった。MCP SDK の Client オブジェクトが内部リソース（EventSource 等）を保持したまま GC 待ちとなり、リソースリークの原因となる。

### 問題 5: RECONNECT_COOLDOWN の短さ

`RECONNECT_COOLDOWN` が 15 秒に設定されており、Penpot backend がセッション切断を処理する前に再接続が発生することがあった。特に Strategy 2（ページ再読み込み）の所要時間（約 15-20 秒）と重なると、クールダウン直後に再度切断を検出してフラッピングが発生する場合があった。

## Decision

6 つの施策でゴーストセッション蓄積を防止し、接続ライフサイクルを安定化する。

### Fix 1: currentWorkspaceUrl によるURL追跡

`currentWorkspaceUrl` 変数でワークスペース URL を記録し、ファイルナビゲーション・再接続時に正確なURLへの復帰を保証する。`page.goBack()` や `page.reload()` のような暗黙的なナビゲーションへの依存を排除。

```javascript
let currentWorkspaceUrl = null;

// openWorkspace 時に記録
currentWorkspaceUrl = wsUrl;

// /navigate エンドポイントで更新
currentWorkspaceUrl = navUrl;
```

### Fix 2: about:blank パターンによる明示的 WebSocket 切断

再接続 Strategy 2 で `page.reload()` の代わりに `about:blank` へナビゲートし、ブラウザが Penpot ページとの全接続（WebSocket 含む）を明示的に閉じるよう強制する。2 秒の待機後にワークスペース URL へ再ナビゲートする。

```javascript
// reconnectPlugin Strategy 2
await page.goto("about:blank");
await sleep(2000); // backend が切断を処理する時間を確保
await page.goto(currentWorkspaceUrl, { ... });
```

同パターンは `/navigate` エンドポイント（ファイル切り替え）でも統一的に使用:

```javascript
// POST /navigate
await page.goto("about:blank");
await sleep(2000);
await page.goto(navUrl, { ... });
```

### Fix 3: グレースフルシャットダウン

SIGINT / SIGTERM 受信時、ブラウザを閉じる前に全ページを `about:blank` へナビゲートし、WebSocket の正常切断（FIN 送信）を保証する。

```javascript
const shutdown = async () => {
  // about:blank で WebSocket を明示的に閉じる
  const pages = browser.contexts()?.[0]?.pages() || [];
  for (const p of pages) {
    await p.goto("about:blank", { timeout: 5000 }).catch(() => {});
  }
  await sleep(1000); // FIN がバックエンドに到達する時間を確保
  await browser.close().catch(() => {});
};
```

### Fix 4: socat TCP keepalive 設定

Penpot frontend（ポート 9001）と WebSocket（ポート 4402）の socat プロキシに TCP keepalive パラメータを追加。idle 接続が中間機器にタイムアウトされることを防止。

```
socat TCP-LISTEN:9001,fork,reuseaddr TCP:penpot-frontend:8080,keepalive,keepidle=10,keepintvl=5,keepcnt=3
socat TCP-LISTEN:4402,fork,reuseaddr TCP:${MCP_SERVICE_NAME}:4402,keepalive,keepidle=10,keepintvl=5,keepcnt=3
```

ポート 4400（プラグイン静的ファイル配信）は短命な HTTP リクエストのみのため keepalive 不要。

### Fix 5: proxy-server.mjs の upstream.close 追加

プロキシ層で上流切断検知時に `upstream.close()` を明示的に呼び出し、MCP SDK Client の内部リソースを確実に解放する。新規接続時にも既存接続を先にクローズ。

```javascript
// connectUpstream: 既存接続のクリーンアップ
if (upstream) {
  try { await upstream.close(); } catch {}
  upstream = null;
}

// ツール呼び出し失敗時: stale 接続のクローズ
const stale = upstream;
upstream = null;
initDone = false;
if (stale) { try { await stale.close(); } catch {} }
```

### Fix 6: RECONNECT_COOLDOWN 延長

`RECONNECT_COOLDOWN` を 15 秒から 30 秒に延長。Strategy 2 の所要時間（約 15-20 秒）を十分にカバーし、backend のセッション処理完了を待つ余裕を確保。

```javascript
const RECONNECT_COOLDOWN = 30000; // 30秒（旧: 15000）
```

## Key Choices

### about:blank を選択した理由

WebSocket を確実に閉じる方法として以下を検討した:

| 方式 | メリット | デメリット |
|------|---------|-----------|
| `page.reload()` | 実装が簡単 | 古い WS を閉じない、ゴーストセッション蓄積 |
| `page.close()` + 新ページ | WS は閉じる | Context 再作成が必要、Cookie 消失リスク |
| **`about:blank` ナビゲート** | **WS を確実に閉じる、Context 維持** | **2 秒の待機が必要** |
| JavaScript で WS.close() | 精密制御 | Penpot 内部 WS への参照取得が困難 |

`about:blank` はブラウザに現在のページの全リソース（WebSocket、EventSource、Service Worker 等）を破棄させる最も確実な方法であり、Cookie やブラウザコンテキストを維持できる。

### 2 秒待機の根拠

`about:blank` 後の `sleep(2000)` は以下を考慮して設定:

- Penpot backend が WebSocket 切断イベントを受信・処理する時間（通常 < 500ms）
- Docker ネットワーク経由の TCP FIN リレー遅延（通常 < 100ms）
- 安全マージン（約 1.4 秒）

1 秒では Penpot backend の処理が間に合わないケースが観測され、3 秒以上は再接続の総所要時間に影響するため、2 秒を採用した。

### socat TCP keepalive の理由

socat プロキシ層に TCP keepalive を設定した理由:

1. **Penpot にはサーバー側 ping/pong がない** — Penpot Plugin WebSocket は application-level の ping/pong を実装していないため、TCP レベルで接続の生存を確認する必要がある
2. **Docker ネットワークの NAT テーブル** — Docker bridge ネットワークの conntrack エントリがデフォルト 5 分でタイムアウトするため、それより短い間隔で keepalive を送信
3. **値の選定**: `keepidle=10`（10 秒 idle 後に開始）、`keepintvl=5`（5 秒間隔）、`keepcnt=3`（3 回失敗で切断）→ 最大 25 秒で死活判定

### proxy 修正（Fix 5）を本 ADR に含めた理由

`upstream.close()` 漏れは proxy-server.mjs のコード（ADR-003 のスコープ）に存在するが、その影響はゴーストセッション問題（本 ADR のスコープ）の一部として顕在化する。proxy → MCP Server 間の stale Client が内部 EventSource を保持したまま残ることで、MCP Server 側でセッションが蓄積する。根本原因と修正のトレーサビリティを維持するため、本 ADR に含める。

## Consequences

### Positive

- ゴーストセッションの蓄積が排除され、Penpot backend のリソース消費が安定する
- コンテナ再起動時に WebSocket が正常に閉じられ、backend 側で即座にセッションが解放される
- socat TCP keepalive により、idle 接続が無警告に切断されるリスクが排除される
- proxy-server.mjs の `upstream.close()` により、MCP SDK Client のリソースリークが解消される
- `about:blank` パターンがナビゲーション・再接続・シャットダウンで統一的に使用され、一貫性がある
- COOLDOWN 延長によりフラッピング（短周期の切断・再接続の繰り返し）が防止される

### Negative

- `about:blank` パターンにより再接続に約 2 秒の追加遅延が発生する（旧: `page.reload()` は即座にリロード開始）
- COOLDOWN 延長により、連続切断時の復旧に最大 30 秒かかる（旧: 15 秒）
- socat keepalive は接続の検出に最大 25 秒かかり、即座の切断検知には不十分（ただしこれはフォールバックであり、主要な切断検知は iframe 内の `#connection-status` チェック）

### Neutral

- Penpot 側のプラグインセッション管理 API が提供されれば、`about:blank` パターンはより精密な切断制御に置き換え可能
- TCP keepalive の値はデフォルトより積極的だが、Docker 内のローカル通信では帯域への影響は無視できる

## Re-evaluation Triggers

- **Penpot が切断 API を提供した場合**: `about:blank` パターンの代わりに、プラグインの明示的切断 API を使用する方がクリーン
- **Penpot が WebSocket ping/pong を実装した場合**: socat TCP keepalive のパラメータ見直し（application-level の keepalive と二重になる）
- **Docker ネットワーク構成を変更した場合**: host ネットワーク使用時は socat keepalive の値を緩和できる可能性がある
- **セッション蓄積が再発した場合**: `sleep(2000)` の延長、または Playwright の `page.on('websocket')` による WS close イベント監視の導入を検討

## Related Files

| ファイル | 説明 |
|---|---|
| [`.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/mcp-connect.mjs`](../../.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/mcp-connect.mjs) | Fix 1-3, 6 の実装（URL 追跡、about:blank、グレースフルシャットダウン、COOLDOWN） |
| [`.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/Dockerfile`](../../.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/Dockerfile) | Fix 4 の実装（socat TCP keepalive 設定） |
| [`.claude/skills/penpot/scripts/mcp-proxy/proxy-server.mjs`](../../.claude/skills/penpot/scripts/mcp-proxy/proxy-server.mjs) | Fix 5 の実装（upstream.close 追加） |
| [`docs/problems/plugin-websocket-disconnect.md`](../problems/plugin-websocket-disconnect.md) | WebSocket 切断の根本原因分析と sleep 対策 |
| [`docs/problems/mcp-timeout-keepalive.md`](../problems/mcp-timeout-keepalive.md) | Node.js keepAliveTimeout によるタイムアウト問題 |
| [`docs/adr/003-mcp-proxy-gate.md`](./003-mcp-proxy-gate.md) | 関連 ADR: プロキシ層の接続管理 |
