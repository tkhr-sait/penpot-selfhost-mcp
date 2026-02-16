# Penpot MCP API リファレンス

Penpot MCP Server の構成、Plugin API の使い方、セルフホスト環境固有の注意事項。

## アーキテクチャ

```
AI Tool (Claude Code / Copilot) --HTTP/SSE--> MCP Server (4401) <--WebSocket--> Browser Plugin (iframe)
                          Plugin static files served on port 4400

Plugin iframe (execute_code) --fetch--> Bridge Server (:3000) --cookie auth--> Penpot Backend (:6060)
                                              ↑ mcp-connect コンテナ内
```

- **MCP Server**: LLMクライアント向けツール提供（`mcp__penpot-official__execute_code`, `mcp__penpot-official__export_shape`, `mcp__penpot-official__penpot_api_info` 等）
- **Penpot Plugin**: WebSocket経由でサーバーと通信、Plugin API を公開
- **Plugin API**: Penpotの設計操作（シェイプ作成・変更・削除、レイアウト制御等）を実行

LLMは **プラグイン環境内で任意のJavaScriptコードを実行** してタスクを完了する。

## MCP ツール一覧

| ツール | 用途 |
|--------|------|
| `mcp__penpot-official__activate` | セッション開始/再接続（penpot-init.js 自動実行） |
| `mcp__penpot-official__execute_code` | Plugin API 環境でJavaScriptを実行 |
| `mcp__penpot-official__export_shape` | シェイプをPNG/SVGでエクスポート（視覚確認） |
| `mcp__penpot-official__penpot_api_info` | API型定義・メンバー情報を取得 |
| `mcp__penpot-official__high_level_overview` | Plugin API の概要 |

> **注意**: `activate` 以外の全ツールは `activate` 呼び出し前はエラーを返す。

## Plugin API リファレンス

penpot / penpotUtils / storage の詳細は `mcp__penpot-official__high_level_overview` ツールで取得可能。型情報は `mcp__penpot-official__penpot_api_info` ツールで確認。

**注意**: `penpot.library.connectLibrary()` の返り値は不完全な場合がある（`name: null`, `components: []`）。
`storage.connectLibrary(id)` ラッパーを使うか、接続後に `penpot.library.connected.find(l => l.id === id)` で再取得すること。

## Plugin API 実践的制約

### レイアウト
- **layoutChild は appendChild 後に sleep 必須**: `layoutChild` は追加直後 `null`。100ms 以上の sleep 後にアクセスすること
- **Flex column/row の children 配列は視覚順序と逆**: `appendChild` は配列先頭に挿入 → 視覚的末尾に追加（呼び出し順 = 表示順）
- **子要素追加**: Flex 親は `appendChild`、非 Flex 親は `insertChild(children.length, shape)`

### テキスト
- `storage.createText()` で fontFamily 自動設定（sourcesanspro）
- `growType` は `resize()` 後に "fixed" リセット → 必要なら再設定
- サイズ変更は `fontSize` プロパティ（`resize()` ではない）

### ボード・シェイプ
- `width`/`height` は読み取り専用 → `resize(w, h)`
- `remove()` はコンポーネント配下では非表示のみ（完全削除は REST API `del-component` / `purge-component`）

### トークン
- `token.value` は読み取り専用 → `remove()` + `addToken()` で更新
- `addSet()` 戻り値は即時読取不可 → `catalog.sets.find()` で再取得
- 大量操作は 10件バッチ + 200ms sleep（WebSocket 切断対策。切断しても MCP 再接続は不要、自動復帰）

### インタラクション
- 同一ページ内のボード間のみ有効（異なるページ間は動作しない）
- `shape.addInteraction(trigger, action, delay?)` で追加
- NavigateTo: `{ type: 'navigate-to', destination: targetBoard }`
- OpenOverlay: `{ type: 'open-overlay', destination: overlayBoard, position: 'center', ... }`
- CloseOverlay: `{ type: 'close-overlay' }`
- API 型は `mcp__penpot-official__penpot_api_info` で確認

### 全般
- `mcp__penpot-official__high_level_overview` の API 仕様を遵守（insertChild、growType、Flex順序等）
- 完了後の検証: [validate-design.js](../scripts/mcp-snippets/validate-design.js) で制約違反を検出

## セルフホスト環境固有の注意

### エアギャップ構成
- `enable-air-gapped-conf` が有効 — Google Fonts への外部通信が無効
- 利用可能フォント: **Source Sans Pro (`sourcesanspro`) のみ**
- 未ロードフォントで `createText()` するとサイズ 0x0 になる

### Playwright SES lockdown 問題
- Playwright の Chromium でプラグインを開くと SES (Secure EcmaScript) lockdown エラーが発生する場合がある
- `mcp-connect.mjs` で `Object.defineProperty` ラッパーを適用して回避済み

### REST API 基本
- 全エンドポイント POST + JSON。`Accept: application/json` ヘッダー必須
- `storage.api(command, params, timeout)` でタイムアウト付き呼び出し（デフォルト10秒）
- `penpot-rest-api.js` を `mcp__penpot-official__execute_code` で初期化して使用
- ファイル一覧: `get-project-files`（`get-files` は存在しない）
- `mcp__penpot-official__execute_code` から REST API を呼ぶ際は、mcp-connect コンテナ内のブリッジサーバー (port 3000) の `/api-proxy` を経由する。ブラウザセッションの Cookie が自動付与されるため、プラグイン側で認証情報を持つ必要がない。詳細は [selfhost.md の mcp-connect ブリッジサーバー](selfhost.md#mcp-connect-ブリッジサーバー) を参照

### update-file チェンジタイプ一覧

| チェンジタイプ | 用途 | 備考 |
|---|---|---|
| `del-component` | コンポーネント削除（ソフト） | ゴミ箱行き、復元可 |
| `purge-component` | コンポーネント完全削除 | 復元不可 |
| `del-page` | ページ削除 | Plugin API にページ削除なし |

### ライブラリ管理
- `createFile()` / `setFileShared()` / `linkLibrary()` / `unlinkLibrary()`
- `getCurrentProjectId()`: 接続中ファイルと同じプロジェクトにライブラリ作成
- `getTeamId()`: Shared Workspace チームを優先
- `get-file-libraries` は推移的依存も返す（重複表示されるが実害なし）
- `duplicateFile` は全ページ・接続を引き継ぐ → 不要ページ（`del-page`）・不要接続（`unlinkLibrary`）を整理

### ファイル切替
- `storage.openFile(projectId, fileId)` → ブリッジサーバーの `/navigate` エンドポイントを呼び出し、Playwright がワークスペース URL を遷移 → MCP 再接続発生（10-15秒）
- `storage.waitForReconnect()` でブリッジサーバーの `/status` を polling し、`ready` になるまで待機
- 再接続後、MCP ツールを呼び出して接続確認。エラー時のみ `/mcp` → Reconnect を案内。`penpot-init.js` + `penpot-rest-api.js` 再初期化が必要

### 画像エクスポート
- `board.export({ type: 'png', scale: 1.5 })` 推奨（2100x1500相当）

### テキスト色変更
REST API で作成されたテキストは content-level に色情報が埋め込まれており、`shape.fills` / `range.fills` 変更が反映されない場合がある。確実な方法は **テキスト削除→再作成**。

### TextRange.align
- `range.align = 'center'` は代入エラーにならないが反映されない
- **回避策**: 親Flex boardの `alignItems: 'center'` + テキストの `growType: 'auto-width'`

### イベントリスナー
```javascript
const id = penpot.on('pagechange', callback);   // → symbol
penpot.off(id);                                   // 解除
// イベント: pagechange, selectionchange, shapechange, themechange, documentsaved
```

