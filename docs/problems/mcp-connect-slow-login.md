# mcp-connect: ログインフォーム検出が遅い

## 概要

`penpot-manage.sh down && up` 後、`mcp-connect.mjs` のログインに約5分半かかる。
HTTP 200 が返った時点ではSPAのレンダリングが未完了で、ログインフォームが見つからずリトライを繰り返す。

## 再現条件

- Penpot コールドスタート直後
- `mcp-connect.mjs` が `page.goto()` に `waitUntil: "domcontentloaded"` を使用
- フロントエンド（ClojureScript SPA）の JS バンドルが大きい

## 観測されたタイムライン

| 時刻 | イベント |
|------|---------|
| 14:41:28 | `waitForService` が HTTP 200 確認 → 「frontend is ready」 |
| 14:41:30〜14:43:59 | ログイン試行 #1〜#5 失敗（email input が visible にならず 30s タイムアウト） |
| 14:47:02 | 試行 #6 で初めて成功（起動から約5分半後） |

## 根本原因

`page.goto()` の `waitUntil: "domcontentloaded"` は HTML パース完了のみ待機する。
Penpot フロントエンドは ClojureScript 製 SPA で、HTML パース後に:

1. JS バンドルのダウンロード（数MB）
2. ClojureScript ランタイムのパース・初期化
3. React/Reagent による DOM レンダリング

が必要。`domcontentloaded` + 固定 `sleep(2000)` ではコールドスタート時に不十分。

## 修正

### `waitUntil: "networkidle"` への変更

```javascript
// Before (L189-191):
await page.goto(`${PENPOT_URI}/#/auth/login`, { waitUntil: "domcontentloaded" });
await sleep(2000);

// After:
await page.goto(`${PENPOT_URI}/#/auth/login`, { waitUntil: "networkidle" });
```

- `networkidle` = 500ms 間ネットワークリクエストが0件になるまで待機
- JS バンドルのダウンロード・パース完了を保証
- 固定 `sleep(2000)` が不要に（networkidle が同等以上の待機を提供）

### 修正結果

| 指標 | Before | After |
|------|--------|-------|
| ログイン成功 | 試行 #6（約5分半） | **試行 #1（2秒）** |
| 起動〜MCP接続完了 | 約6分 | **約8秒** |

## 対象ファイル

- `.claude/skills/penpot/scripts/penpot-selfhost/mcp-connect/mcp-connect.mjs` L191

## 検討した代替案

| 案 | 内容 | 採否 |
|----|------|------|
| A: waitForLoginForm | ブラウザで DOM 要素の visible を直接待つ | 不採用（login() 内で既に waitFor している） |
| B: リトライ間隔短縮 | 初回待機を長くする | 不採用（根本解決にならない） |
| **C: networkidle** | **goto の waitUntil を変更** | **採用** |

## 日付

2026-02-15
