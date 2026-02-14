# Plugin WebSocket 切断: 原因・緩和・自動復旧

## 概要

Penpot Plugin API でデザイントークン操作（`addSet`, `addToken`, `applyToken` 等）を実行すると、
プラグイン WebSocket が非同期的に切断される。操作自体は成功しデータロスもないが、
プラグイン接続が失われ次の `execute_code` 呼び出しが失敗する。

2つの対策（sleep による操作中の安定化 + mcp-connect.mjs の自動再接続）で実用上問題ない状態にした。

## 接続アーキテクチャ

```
Claude Code ──HTTP──> MCP サーバー ──WebSocket──> Plugin iframe ──> Penpot
                      (penpot-mcp-claude)        (mcp-connect.mjs が管理)
```

切断されるのは **Plugin iframe ↔ MCP サーバー間の WebSocket** のみ。
Claude Code ↔ MCP サーバー間の HTTP 接続は影響を受けない。
→ WebSocket を復旧すれば、Claude Code 側の `/mcp` 再接続は不要。

## 再現条件

- MCP `execute_code` でトークン操作を実行
- 特にトリガーしやすい操作:
  - `catalog.addSet()` — 新しいトークンセットの作成
  - `set.toggleActive()` — セットの有効化/無効化
  - `set.addToken()` — トークンの追加
  - `shape.applyToken()` — シェイプへのトークン適用
- 1回の操作で必ず起きるわけではない（UI 状態・タイミング依存）
- 複数操作を連続実行すると発生確率が上がる

### 観測パターン

```
execute_code #1: ensureTokenSet('MySet') → 成功（セット作成 + activate）
execute_code #2: tokenOverview()         → エラー（WebSocket 切断済み）
```

- `execute_code` 内の操作は全て正常完了
- 切断は `execute_code` 返却**後**の非同期 UI 更新で発生

## 根本原因

Penpot のプラグインシステムは iframe + WebSocket ベース。
トークン操作がファイルデータの変更をトリガーすると:

1. Penpot バックエンドがファイル変更を処理
2. フロントエンドが WebSocket 通知を受け取り UI を再描画
3. 再描画の過程でプラグイン iframe が再初期化される場合がある
4. 再初期化でプラグイン ↔ MCP サーバー間の WebSocket が切断

### 重要な特性

| 特性 | 説明 |
|------|------|
| 操作のコミット | 即座（同期的に完了） |
| データロス | なし（切断されるのは通信チャネルのみ） |
| 切断される箇所 | Plugin iframe ↔ MCP サーバー間の WebSocket のみ |
| Claude Code ↔ MCP サーバー | 影響なし（HTTP 接続は独立） |
| 再現性 | 確率的（毎回ではない） |
| sleep で防げるか | 防げない（切断は `execute_code` 返却後の非同期処理で発生） |

## 対策1: token-utils.js の sleep（execute_code 内の安定性）

`token-utils.js` の各操作関数に sleep を挿入し、同一 `execute_code` 内での連続操作の安定性を確保。

```javascript
// ensureTokenSet: セット作成/有効化後に sleep
storage.ensureTokenSet = async (name, opts) => {
  const catalog = penpot.library.local.tokens;
  let set = catalog.sets.find(s => s.name === name);
  if (set) {
    if (activate && !set.active) {
      set.toggleActive();
      await sleep(100);   // ← UI 更新待ち
    }
    return { set, created: false };
  }
  set = catalog.addSet(name);
  await sleep(100);       // ← UI 更新待ち
  // ...
};

// ensureToken: トークン作成/更新後に sleep
storage.ensureToken = async (set, type, name, value) => {
  // ...
  const token = set.addToken(type, name, String(value));
  await sleep(50);        // ← UI 更新待ち
  return { token, action: 'created' };
};

// applyTokenSafe: 適用後に sleep
storage.applyTokenSafe = async (shape, tokenOrName, properties) => {
  // ...
  shape.applyToken(token, properties);
  await sleep(100);       // ← 非同期反映待ち
};

// ensureTokenBatch: 10件ごとに追加 sleep
storage.ensureTokenBatch = async (set, tokens) => {
  for (let i = 0; i < tokens.length; i++) {
    await storage.ensureToken(set, ...);
    if ((i + 1) % 10 === 0) await sleep(50);  // ← バースト緩和
  }
};
```

### sleep 値の選定

| 操作 | sleep | 理由 |
|------|-------|------|
| `addSet` / `toggleActive` | 100ms | セット構造の変更は UI 変更が大きい |
| `addToken` / `value` 更新 | 50ms | 個別トークンの変更は比較的軽い |
| `applyToken` | 100ms | シェイプ再描画 + トークンバインディング反映 |
| バッチ 10件ごと | 50ms | 連続操作のバースト緩和 |

## 対策2: mcp-connect.mjs の自動再接続（execute_code 間の復旧）

### 接続モニター (`startConnectionMonitor`)

```javascript
const MONITOR_INTERVAL = 5000;     // 5秒ごとにチェック
const RECONNECT_COOLDOWN = 15000;  // 再接続後15秒のクールダウン

function startConnectionMonitor(page) {
  setInterval(async () => {
    if (navigationStatus !== "ready") return;
    if (Date.now() - lastReconnectTime < RECONNECT_COOLDOWN) return;

    const connected = await checkPluginConnected(page);
    if (!connected) {
      lastReconnectTime = Date.now();
      await reconnectPlugin(page);
      // 失敗時は "ready" に戻してリトライ可能にする
      if (navigationStatus === "error") navigationStatus = "ready";
    }
  }, MONITOR_INTERVAL);
}
```

- `keepAlive()` から起動（ブラウザが生きている間ずっと監視）
- iframe 内の `#connection-status` 要素のテキストで接続判定
- 接続中はオーバーヘッドゼロ（ログ出力なし）

### 接続チェック (`checkPluginConnected`)

```javascript
async function checkPluginConnected(page) {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const statusEl = frame.locator("#connection-status");
    const text = await statusEl.textContent({ timeout: 2000 });
    if (text && text.toLowerCase().includes("connected")) return true;
  }
  return false;
}
```

`verifyConnection()` のチェックロジックを再利用可能な関数として抽出。

### 再接続の2段階フォールバック (`reconnectPlugin` 改良)

```
Strategy 1: Escape → viewport click → Ctrl+Alt+P (高速、5秒)
     ↓ 失敗
Strategy 2: page.reload() → Ctrl+Alt+P (確実、15-20秒)
```

**Strategy 1 が失敗する理由**: WebSocket 切断後、Penpot UI のキーボードショートカット
ハンドラが壊れた状態になることがある。`Ctrl+Alt+P` が Plugin Manager を開けない。

**Strategy 2 で解決**: ページリロードで Penpot UI を完全に初期化し直す。
リロード後はキーボードショートカットが正常に動作する。

## 2つの対策の関係

```
execute_code #1                    |  間隔  |  execute_code #2
─────────────────────────────────  |        |  ──────────────────
addSet → sleep(100) → addToken     |  5-20s |  tokenOverview()
  ↑ sleep が操作途中の切断を緩和    |   ↑    |    ↑
                                   | monitor|  接続が復旧済み
                                   | が検出 |  → 成功
                                   | →再接続|
```

| 対策 | 保護範囲 | 効果 |
|------|---------|------|
| sleep (token-utils.js) | 同一 execute_code 内 | 連続操作の途中切断を緩和（確率的） |
| auto-reconnect (mcp-connect.mjs) | execute_code 間 | 切断後の確実な自動復旧 |

**補完的**: auto-reconnect があれば sleep を最小限にできる。sleep がなくても後続呼び出しは成功する。

## 修正結果

| 指標 | Before | After |
|------|--------|-------|
| 切断検出 | なし（手動確認） | **5秒以内に自動検出** |
| 復旧方法 | `mcp-connect claude` + `/mcp` | **自動（約18秒）** |
| ユーザー操作 | 必要 | **不要** |
| 後続の execute_code | `/mcp` 再接続が必要 | **そのまま動作** |

### 観測されたログ（成功例）

```
[15:36:36] [monitor] Plugin disconnected. Auto-reconnecting ...
[15:36:36] [nav] Reconnecting MCP plugin ...
[15:36:47] [nav] Shortcut failed, reloading page ...
[15:36:54] [nav] MCP reconnected successfully.
```

## 対象ファイル

- `.claude/skills/penpot/scripts/mcp-snippets/token-utils.js` — sleep による安定化
- `.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/mcp-connect.mjs` — 自動再接続
  - 定数: `MONITOR_INTERVAL`, `RECONNECT_COOLDOWN`
  - 変数: `lastReconnectTime`
  - 関数: `checkPluginConnected()`, `startConnectionMonitor()`
  - 変更: `reconnectPlugin()` (2段階フォールバック), `keepAlive()` (page引数 + monitor起動)

## 日付

2026-02-15
