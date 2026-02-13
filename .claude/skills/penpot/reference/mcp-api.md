# Penpot MCP API リファレンス

Penpot MCP Server の構成、Plugin API の使い方、セルフホスト環境固有の注意事項。

## アーキテクチャ

```
AI Tool (Claude Code / Copilot) --HTTP/SSE--> MCP Server (4401) <--WebSocket--> Browser Plugin (iframe)
                          Plugin static files served on port 4400

Plugin iframe (execute_code) --fetch--> Bridge Server (:3000) --cookie auth--> Penpot Backend (:6060)
                                              ↑ mcp-connect コンテナ内
```

- **MCP Server**: LLMクライアント向けツール提供（`execute_code`, `export_shape`, `penpot_api_info` 等）
- **Penpot Plugin**: WebSocket経由でサーバーと通信、Plugin API を公開
- **Plugin API**: Penpotの設計操作（シェイプ作成・変更・削除、レイアウト制御等）を実行

LLMは **プラグイン環境内で任意のJavaScriptコードを実行** してタスクを完了する。

## MCP ツール一覧

| ツール | 用途 |
|--------|------|
| `execute_code` | Plugin API 環境でJavaScriptを実行 |
| `export_shape` | シェイプをPNG/SVGでエクスポート（視覚確認） |
| `penpot_api_info` | API型定義・メンバー情報を取得 |
| `high_level_overview` | Plugin API の概要（初回のみ） |

## 主要オブジェクト

### `penpot` (型: Penpot)

| プロパティ/メソッド | 説明 |
|---------------------|------|
| `penpot.root` | 現在のアクティブページのルートシェイプ |
| `penpot.currentPage` | 現在のページオブジェクト |
| `penpot.selection` | ユーザーが選択中のシェイプ配列 |
| `penpot.openPage(page, false)` | ページ切替（**第2引数 `false` 必須**） |
| `penpot.createBoard()` | ボード作成 |
| `penpot.createRectangle()` | 矩形作成 |
| `penpot.createEllipse()` | 楕円作成 |
| `penpot.createText(chars)` | テキスト作成 |
| `penpot.createPath()` | パス作成 |
| `penpot.group(shapes)` | グループ化 |
| `penpot.generateStyle(shapes, opts)` | CSS生成 |
| `penpot.generateMarkup(shapes, opts)` | HTML/SVG生成 |
| `penpot.library` | ライブラリコンテキスト |

### `penpotUtils` ユーティリティ

| メソッド | 説明 |
|----------|------|
| `getPages()` | 全ページ一覧 `{ id, name }[]` |
| `getPageById(id)` | IDでページ取得 |
| `getPageByName(name)` | 名前でページ取得 |
| `shapeStructure(shape, maxDepth?)` | シェイプの階層構造を概観 |
| `findShapeById(id)` | IDでシェイプ検索（全ページ） |
| `findShape(predicate, root?)` | 条件でシェイプ検索（最初の1つ） |
| `findShapes(predicate, root?)` | 条件でシェイプ検索（全件） |
| `isContainedIn(shape, container)` | シェイプが容器内に収まっているか |
| `setParentXY(shape, parentX, parentY)` | 親に対する相対位置を設定 |
| `addFlexLayout(container, dir)` | 既存子要素の順序を保ったままFlexレイアウト追加 |
| `analyzeDescendants(root, evaluator, maxDepth?)` | 子孫の分析・検証 |

### `storage` オブジェクト

- `execute_code` の呼び出し間でデータを保持
- 関数も保存可能（ユーティリティライブラリとして構築）
- **セッション間でリセットされる可能性あり** — 再定義可能な設計にすること

## シェイプ操作の重要ルール

### 位置・サイズ
- `x`, `y`: 絶対座標（書き込み可能）
- `parentX`, `parentY`: 読み取り専用 → `penpotUtils.setParentXY()` を使う
- `width`, `height`: 読み取り専用 → `shape.resize(w, h)` を使う
- `bounds`: 読み取り専用

### 子要素の追加
- **`parent.insertChild(parent.children.length, shape)`** を使う（推奨）
- **`parent.appendChild(shape)` は FlexレイアウトのBoardのみ** 使用可（視覚順の先頭に追加）
- 非Flexの `appendChild` は予測不能な位置に挿入される

### テキスト
- **`fontFamily: "sourcesanspro"` 必須**（唯一のビルトインフォント）
- `resize()` は `growType` を `"fixed"` にリセットする → 必ず `"auto-width"` or `"auto-height"` に再設定
- テキスト色は `range.fills` で決まる（`shape.fills` は背景色に対応する場合あり）

### Flexレイアウト
- `dir="column"` / `dir="row"` では **children 配列の順序が視覚順と逆**
- `board.appendChild(shape)` は配列の先頭に挿入 → 視覚的に末尾に表示される
- 子の位置は `layoutChild` プロパティで制御（`horizontalSizing`, `verticalSizing`, マージン等）
- `layoutChild.absolute = true` で レイアウトから除外（位置は親相対）
- レイアウト追加: 既存子要素がある場合は `penpotUtils.addFlexLayout(container, dir)` を使う

### ページ切替
- **`penpot.openPage(page, false)`** — 第2引数 `false` 必須
- `false` を省略すると新しいウィンドウが開き、MCP接続が切断される
- 引数は `Page` オブジェクト: `penpotUtils.getPageById(id)` で取得

## ライブラリ

```javascript
// ローカルライブラリ
penpot.library.local           // Library
penpot.library.local.colors    // LibraryColor[]
penpot.library.local.components // LibraryComponent[]
penpot.library.local.typographies // LibraryTypography[]

// 接続済み外部ライブラリ
penpot.library.connected       // Library[]

// カラーをfill/strokeとして使用
const color = penpot.library.local.colors.find(c => c.name === 'accent-blue');
shape.fills = [color.asFill()];           // fillColorRefId が自動セット
shape.strokes = [color.asStroke()];

// コンポーネントのインスタンス化
const comp = penpot.library.local.components.find(c => c.name === 'Button');
const instance = comp.instance();          // Shape を返す
```

**注意**: `penpot.library.connectLibrary()` の返り値は不完全な場合がある（`name: null`, `components: []`）。
`storage.connectLibrary(id)` ラッパーを使うか、接続後に `penpot.library.connected.find(l => l.id === id)` で再取得すること。

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
- `penpot-rest-api.js` を execute_code で初期化して使用
- ファイル一覧: `get-project-files`（`get-files` は存在しない）
- `execute_code` から REST API を呼ぶ際は、mcp-connect コンテナ内のブリッジサーバー (port 3000) の `/api-proxy` を経由する。ブラウザセッションの Cookie が自動付与されるため、プラグイン側で認証情報を持つ必要がない。詳細は [selfhost.md の mcp-connect ブリッジサーバー](selfhost.md#mcp-connect-ブリッジサーバー) を参照

### update-file チェンジタイプ一覧

| チェンジタイプ | 用途 | 備考 |
|---|---|---|
| `add-color` | カラー追加 | |
| `del-color` | カラー削除 | |
| `add-typography` | タイポグラフィ追加 | |
| `del-typography` | タイポグラフィ削除 | |
| `del-component` | コンポーネント削除（ソフト） | ゴミ箱行き、復元可 |
| `purge-component` | コンポーネント完全削除 | 復元不可 |
| `del-page` | ページ削除 | Plugin API にページ削除なし |

### クロスファイル操作
- `storage.execInFile(projectId, fileId, operations)`: MCP切断なしで他ファイルにアセット登録
- 便利メソッド: `registerColorsInFile()`, `registerTypographiesInFile()`
- REST API (`update-file` の `add-color` / `add-typography` チェンジ) を使用

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

## コメント操作

デザイナーが Penpot UI で残したコメントの確認・返信・解決を行う。

### MCP Plugin API

`Page` のコメント関連メソッド:

| メソッド | 説明 |
|----------|------|
| `page.findCommentThreads(criteria?)` | コメントスレッド一覧を取得（`Promise<CommentThread[]>`） |
| `page.addCommentThread(content, position)` | 新規コメントスレッド作成 |
| `page.removeCommentThread(thread)` | コメントスレッド削除 |

`criteria` オブジェクト（任意）:
- `onlyActive: boolean` — アクティブなスレッドのみ
- `showResolved: boolean` — 解決済みも含めるか（`false` で未解決のみ）

`CommentThread` プロパティ・メソッド:

| プロパティ/メソッド | 型 | 説明 |
|---------------------|-----|------|
| `seqNumber` | `number` | スレッド番号（`#1`, `#2`, ...） |
| `resolved` | `boolean` | 解決済みフラグ（書き込み可能） |
| `findComments()` | `Promise<Comment[]>` | スレッド内の全コメント取得 |
| `reply(content)` | `Promise<Comment>` | 返信を追加 |

`Comment` プロパティ:

| プロパティ | 型 | 説明 |
|------------|-----|------|
| `content` | `string` | コメント本文 |
| `user` | `User` | 投稿者情報 |
| `date` | `Date` | 投稿日時 |

### コード例

```javascript
// 未解決コメントスレッドを取得
const threads = await penpot.currentPage.findCommentThreads({
  onlyActive: true,
  showResolved: false
});

// 各スレッドのコメントを確認
for (const thread of threads) {
  const comments = await thread.findComments();
  console.log(`#${thread.seqNumber}: ${comments.map(c => c.content).join(' → ')}`);
}

// 返信する
await threads[0].reply('修正しました。ご確認ください。');

// 解決済みにする
threads[0].resolved = true;
```

### 注意事項

- `findCommentThreads()` は **ページスコープ** — 複数ページにまたがる場合はREST APIで先にファイル全体を把握するのが効率的
- MCP経由でのコメント所有者は **MCP専用ユーザー** (MCP Agent) になる
- `comment:read` / `comment:write` パーミッションは既にプラグインマニフェストで有効
