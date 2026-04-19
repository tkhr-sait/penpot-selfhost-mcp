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
| `activate` | セッション開始/再接続（storage ラッパー自動初期化） |
| `execute_code` | Plugin API 環境でJavaScriptを実行 |
| `export_shape` | シェイプをPNG/SVGでエクスポート（視覚確認） |
| `penpot_api_info` | API型定義・メンバー情報を取得 |
| `high_level_overview` | Plugin API の概要 |

> **注意**: `activate` 以外の全ツールは `activate` 呼び出し前はエラーを返す。

### activate レスポンス構造

`activate` は storage ラッパーを自動初期化し、以下の構造のテキストを返す:

```
{
  context: {
    currentPage: { id, name },         // 現在開いているページ
    pages: [{ id, name }],             // ファイル内全ページ一覧
    tokenSets: ['Shared', 'Light', ...], // トークンセット名の配列
    componentCount: 12,                // 登録済みコンポーネント数
    connectedLibs: [{ id, name }]      // 接続済みライブラリ
  },
  metrics: {                           // フェーズ判定用数値
    tokenSets: 2, components: 12, connectedLibs: 1, pages: 3
  },
  wrappers: [...]                      // storage ラッパー対応表
}
```

- `context` で既存ページ・トークン状態を把握し、再利用 or 新規作成を判断する
- `metrics` はスキルのフェーズ判定に使用（SKILL.md 参照）
- WebSocket 切断時も `activate` 再呼び出しで復帰可能

## Plugin API 直接呼び出し(storage ラッパーが優先)

direct Plugin API を呼ぶ場合の正規シグネチャと storage ラッパー対応:

| Plugin API | storage ラッパー(推奨) |
|---|---|
| `catalog.addSet({ name })` | `storage.ensureTokenSet(name)` |
| `set.addToken({ type, name, value })` | `storage.ensureToken(set, type, name, value)` |
| `catalog.addTheme({ group, name })` | `storage.ensureTheme(group, name, sets)` |
| `token.applyToSelected(Array<string>)` | `storage.applyTokenSafe(shape, tokenOrName, props)` / `applyTokenToShapesSafe` |

- プロパティ名は **camelCase**(`strokeColor`, `rowGap` 等)。storage ラッパーは kebab-case 入力も内部で正規化
- `token.applyToSelected` の props は **Array**(Set は受理されない)
- `shape.applyToken` / `token.applyToShapes` は使わない — 代わりに `penpot.selection = [shape]` + `token.applyToSelected(props)`、または storage ラッパーを使用
- **適用済みトークンの読み取りは `shape.tokens`**（`{ fill: 'token-name', stroke: 'token-name', ... }` 形式、未適用時は空配列 `[]`）

## Plugin API リファレンス

```
┌─────────────────────────────────────────┐
│  storage（ラッパー層）                    │ ← 基本こちらを使う
│  createText / createAndOpenPage / ...   │
├─────────────────────────────────────────┤
│  penpotUtils（検索・走査層）              │ ← 探すとき
│  findShapes / getPages / tokenOverview  │
├─────────────────────────────────────────┤
│  penpot（ネイティブAPI層）               │ ← ボード/矩形作成・Flex設定
│  createBoard / createRectangle / flex   │
└─────────────────────────────────────────┘
```

**判断基準**: storage にラッパーがあればそちらを使う。ネイティブ直接呼び出しはバグ回避策が無効化されるため禁止。

各層の詳細は `high_level_overview` ツールで取得可能。型情報は `penpot_api_info` ツールで確認。

**注意**: `penpot.library.connectLibrary()` の返り値は不完全な場合がある（`name: null`, `components: []`）。
`storage.connectLibrary(id)` ラッパーを使うか、接続後に `penpot.library.connected.find(l => l.id === id)` で再取得すること。

## Plugin API 実践的制約

### storage ラッパー優先ルール

activate で初期化される storage ラッパーは、対応する penpot ネイティブメソッドの **代わりに** 使用すること。ネイティブメソッドを直接使うとバグや環境制約の回避策が無効化される。

| 必ず使う | 使わない | 理由 |
|---------|---------|------|
| `storage.createText()` | `penpot.createText()` | fontFamily 未設定→0x0テキスト（エアギャップ環境） |
| `storage.appendChild()` | `parent.appendChild()`+sleep+`layoutChild` | Flex/非Flex判定+sleep+layoutChild返却（null回避） |
| `storage.createAndOpenPage()` | `penpot.createPage()`+`openPage()` | 切替検証・Page 1 再利用 |
| `storage.connectLibrary()` | `penpot.library.connectLibrary()` | 返り値 name:null, components:[] 問題 |
| `storage.toggleSetPersistent()` | `set.active = bool` | set.active はセッション限定（永続化は UI 自動化経由） |
| `storage.switchThemePersistent()` | （対応なし） | 複数セットの永続的テーマ切替 |

> activate レスポンスにも同じ対応表が含まれる。

### execute_code

- **戻り値は `return` で返す**: 末尾の式評価では出力されない（`result` が空文字になる）。戻り値は自動シリアライズされるため `JSON.stringify` は不要
  ```javascript
  // NG: result が空（return なし）
  penpotUtils.shapeStructure(shape, 2);
  // OK: オブジェクトをそのまま return（自動シリアライズ）
  return penpotUtils.shapeStructure(shape, 2);
  ```
- **`penpotUtils` を活用する**: 独自のシェイプ検索・ページ走査を実装しない
  - ページ走査: `penpotUtils.getPages()` / `penpotUtils.getPageById(id)`（※ `penpot.pages` は存在しない）
  - シェイプ検索: `penpotUtils.findShapes(predicate, root)` — root 省略（null）で全ページ横断検索。root に frame/page を渡せば配下を再帰検索（※ `frame.findShapes()` は存在しない。`page.findShapes()` とは別）
  - 構造確認: `penpotUtils.shapeStructure(shape, depth)`
  - 全ユーティリティ一覧: `high_level_overview` 参照
- **不明な型・メソッド**: `penpot_api_info` で確認してから使用

### ページ操作

| メソッド | 用途 | 注意 |
|---------|------|------|
| `storage.createAndOpenPage(name)` | ページ作成+切替 | `await` 必須。空の Page 1 は自動再利用 |
| `penpotUtils.getPages()` | ページ一覧取得 | `penpot.pages` は存在しない |
| `penpotUtils.getPageById(id)` | ID でページ取得 | |
| `penpot.openPage(page, false)` | ページ切替 | 第2引数 `false` 必須 |
| `storage.assertCurrentPage(page)` | 現在ページの検証ガード | 違うページならエラー |
| `storage.getPageContext()` | 現在ページのボード一覧 | `{ page, boards }` を返す |

- 最低1ページ制約（最後のページは削除不可。削除は REST API `del-page`）
- 複数ページ作業時は `assertCurrentPage` でシェイプ作成先を必ず確認する

### レイアウト
- **子要素追加は `storage.appendChild()` を使う**: Flex/非Flex 判定 + 100ms sleep + `layoutChild` 返却を自動処理
  ```javascript
  const lc = await storage.appendChild(flexParent, child);
  lc.horizontalSizing = 'fill'; // lc は child.layoutChild（非Flex親ではnull）
  ```
- **Flex column/row の children 配列は視覚順序と逆**: `appendChild` は配列先頭に挿入 → 視覚的末尾に追加（呼び出し順 = 表示順）

### テキスト
- `storage.createText()` で fontFamily 自動設定（sourcesanspro）
- `growType` は `resize()` 後に "fixed" リセット → 必要なら再設定
- サイズ変更は `fontSize` プロパティ（`resize()` ではない）
- `text.textBounds` でテキストのバウンディングボックス取得（オーバーフロー含む `{ x, y, width, height }`）

### ボード・シェイプ
- `width`/`height` は読み取り専用 → `resize(w, h)`
- `fills`/`strokes` の配列要素は読み取り専用 → 配列全体を置換: `shape.fills = [{ fillColor: "#FF0000", fillOpacity: 1 }]`
- `remove()` はコンポーネント配下では非表示のみ（完全削除は REST API `del-component` / `purge-component`）

### トークン
- `token.value` は読み取り専用 → `remove()` + `addToken()` で更新
- `addSet()` 戻り値は即時読取不可 → `catalog.sets.find()` で再取得
- 大量操作は 10件バッチ + 200ms sleep（WebSocket 切断対策。切断しても MCP 再接続は不要、自動復帰）
> **注意**: プロパティ引数は **camelCase が正規形**（`strokeColor`, `rowGap` 等 — `penpot_api_info` の型情報と一致）。
> `storage.applyTokenSafe` / `applyTokenToShapesSafe` は kebab-case 入力も受理し内部で camelCase に自動正規化するため既存コード互換。

- `storage.applyTokenSafe()` のトークンタイプ→プロパティ対応(camelCase 正規形):

| トークンタイプ | 適用プロパティ |
|--------------|-------------|
| `color` | `fill`, `strokeColor` |
| `spacing` | `rowGap`, `columnGap`, `p1`(top) `p2`(right) `p3`(bottom) `p4`(left), `m1`... |
| `borderRadius` | `r1`(top-left) `r2`(top-right) `r3`(bottom-right) `r4`(bottom-left) |
| `sizing` | `width`, `height`, `layoutItemMinW`, `layoutItemMaxW`, `layoutItemMinH`, `layoutItemMaxH` |
| `borderWidth` | `strokeWidth` |
| `dimension` | `x`, `y`, `strokeWidth` |
| `fontSizes` | `fontSize` |
| `fontWeights` | `fontWeight` |
| `letterSpacing` | `letterSpacing` |
| `textDecoration` | `textDecoration` |
| `textCase` | `textCase` |

#### デフォルトセマンティックトークン

14色+spacing+borderRadius の定義値は [design.md のセマンティックカラートークン](design.md#セマンティックカラートークン) を参照。

一括登録:
```javascript
const result = await storage.ensureSemanticTokens();
// カスタマイズ: await storage.ensureSemanticTokens({ overrides: { ... } })
// Typography: await storage.ensureSemanticTokens({ includeTypography: true })
return result;
```
トークン一覧は `storage.SEMANTIC_TOKEN_DEFAULTS` で参照可能。

Shared + Light セットがセッション内でアクティブ化される。テーマ定義が必要な場合は `storage.ensureTheme()` を別途呼び出す（WS 切断の可能性あり）。

#### トークン登録パターン（個別登録）

`storage.ensureTokenSet` → `storage.ensureToken` / `storage.ensureTokenBatch` → `storage.applyTokenSafe` の順で冪等登録・適用。`penpotUtils.tokenOverview()` で確認。

コード例 → [howto: トークン一括登録](../howto/token-registration.md)

### テーマ管理
- `catalog.addTheme({ group, name })` でテーマ作成
- `theme.addSet(setObj)` でテーマにセットを関連付け（Plugin API 内のみ、サーバー永続化なし）
- **⚠ `theme.toggleActive()` は WebSocket 切断を引き起こす** — 使用禁止。テーマ切替はセット単位で `set.active = true/false` を使う
- **⚠ `theme.activeSets` は常に null** — Plugin API でのテーマ→セット関連の直接読み取りは不可。`ensureTheme` のセッション内キャッシュ (`__themeSetMap`) が唯一の有効データソース

#### Plugin API 永続化制約

| 操作 | Plugin API 内 | サーバー永続化 |
|------|--------------|---------------|
| `catalog.addSet()` | OK | **OK** |
| `set.addToken()` | OK | **OK** |
| `catalog.addTheme()` | OK | **OK** |
| `theme.addSet()` | OK | **NG**（セッション限定） |
| `set.active` / `toggleActive()` | OK | **NG**（セッション限定） |

`theme.addSet()` と `set.active` の変更はページリロードで失われる。永続化には Playwright UI 自動化経由の `storage.toggleSetPersistent()` / `storage.switchThemePersistent()` を使用する。

#### テーマ構築フロー（セット作成→テーマ作成→関連付け）

1. `storage.ensureTokenSet()` でベース→テーマ固有の順にセット作成
2. `storage.ensureToken()` でテーマ固有値を登録
3. `storage.ensureTheme(group, name, sets[])` で冪等にテーマ作成+セット関連付け
4. `storage.switchThemePersistent()` で永続化

コード例 → [howto: テーマ構築](../howto/theme-setup.md)

### テーマ切替（セットの active 制御）

> テーマ切替の原則・アンチパターンは [design.md のテーマ切替戦略](design.md#テーマ切替戦略) を参照。

- **セット作成順序に注意**: Shared（ベース）セットを最初に作成し、テーマ固有セット（Dark/Light）を後に作成すること。
  `catalog.sets` の順序でトークン優先度が決まり、後のセットが優先される。
  `theme.addSet()` の呼び出し順序は優先度に影響しない（カタログ順のみが関係する）。
- 同名トークン（例: `color.bg.primary`）を Dark/Light 両セットに定義
- `set.active = true/false` でセットの有効/無効を切替（**セッション限定 — リロードで失われる**）
- 複数セットが同名トークンを持つ場合、**カタログ順で後のセットが優先**
- セッション限定テーマ切替（エクスポート前の一時切替に使用）:
  ```javascript
  // Dark テーマ表示（セッション限定 — リロードで失われる）
  darkSet.active = true; lightSet.active = false; sharedSet.active = true;
  // Light テーマ表示
  darkSet.active = false; lightSet.active = true; sharedSet.active = true;
  ```
- **永続的なテーマ切替**（推奨 — Playwright UI 自動化経由でサーバーに保存される）:
  ```javascript
  // Dark テーマに永続切替
  await storage.switchThemePersistent(['Shared', 'Dark'], ['Light']);
  // Light テーマに永続切替
  await storage.switchThemePersistent(['Shared', 'Light'], ['Dark']);
  // 個別セット切替
  await storage.toggleSetPersistent('Dark', true);
  ```
- Light 用に別コンポーネントを手作りする必要はない — 同じコンポーネントにトークン適用し、セット切替で対応

### インタラクション
- 同一ページ内のボード間のみ有効（異なるページ間は動作しない）
- `shape.addInteraction(trigger, action, delay?)` で追加
  - trigger: 文字列（`'click'`, `'mouse-enter'`, `'mouse-leave'`, `'after-delay'` 等）
  - action: オブジェクト（`{ type: 'navigate-to', destination: targetBoard }` 等）
- **保存される Action**:
  - NavigateTo: `{ type: 'navigate-to', destination: targetBoard }`
  - CloseOverlay: `{ type: 'close-overlay' }`
  - PreviousScreen: `{ type: 'previous-screen' }`
  - OpenUrl: `{ type: 'open-url', url: '...' }`
- **保存されない Action**（`addInteraction` が `null` を返す）:
  - OpenOverlay: `{ type: 'open-overlay', destination: board }`
  - ToggleOverlay: `{ type: 'toggle-overlay', destination: board }`
  - 対処: `navigate-to` で設定し、必要なら Penpot UI で OpenOverlay に切り替える
- API 型は `penpot_api_info` で確認

### コード生成（ハンドオフ）

```javascript
// CSS 生成（子要素含む）
penpot.generateStyle(shapes, { type: 'css', withChildren: true });

// HTML / SVG マークアップ生成
penpot.generateMarkup(shapes, { type: 'html' });
penpot.generateMarkup(shapes, { type: 'svg' });
```

- `shapes` は配列（単一シェイプも `[shape]` で渡す）
- トークン値の取得: `storage.findToken(name)` — 未登録ならエラーに登録済み名を含む

### 全般
- `high_level_overview` の API 仕様を遵守（insertChild、growType、Flex順序等）
- 完了後の検証: `return storage.validateDesign()` で制約違反を検出

### よくあるハマりポイント

| 問題 | 原因 | 解決策 |
|------|------|--------|
| テキストが 0x0 サイズ | `penpot.createText()` 直接使用 | `storage.createText()` を使う |
| `layoutChild` が null | appendChild 直後にアクセス | `storage.appendChild()` を使う（sleep 内蔵） |
| `hSizing` / `vSizing` が効かない | プロパティ名が違う | `horizontalSizing` / `verticalSizing` |
| `execute_code` の結果が空 | 末尾の式評価では出力されない | `return` 文を使う |
| トークン `set.active` の変更がファイル再オープン後に失われる | Plugin API の `active` 変更はセッションスコープ | セッション内は `set.toggleActive()` または `set.active = bool`、永続化は `storage.switchThemePersistent()` |
| `frame.findShapes()` がエラー | 存在しないメソッド（`page.findShapes()` とは別） | `penpotUtils.findShapes(pred, frame)` |
| `penpot.pages` がエラー | 存在しないプロパティ | `penpotUtils.getPages()` |
| インタラクションが動かない | 異なるページ間で設定 | 同一ページ内のボード間のみ有効 |
| `open-overlay` / `toggle-overlay` / `close-overlay` アクションが保存されない | `addInteraction` が null を返し interactions に追加されない | `navigate-to` で代替 |
| `shape.fills[0].fillColor = ...` が効かない | fills/strokes の要素は読み取り専用 | 配列全体を置換: `shape.fills = [{...}]` |
| `token.resolvedValue` が自トークンの値と一致しない | `resolvedValue` は**アクティブセット優先解決後の値**を返す（同名トークンが複数セットにある場合、優先セットの値で上書き解決される） | 自セットの value が欲しいときは `token.value` を使用。fontFamilies は fontNameMap で手動変換 |
| 大量操作で WebSocket 切断 | バースト過多 | 10件バッチ + 200ms sleep |
| 切断後にカスタムヘルパーが消失 | WebSocket 自動復帰で storage リセット | 冪等ガード付きヘルパー登録を再実行（ビルトインは activate で復元） |
| `flex.padding = { top, right, bottom, left }` が効かない | FlexLayout に `padding` プロパティなし | `flex.topPadding`/`rightPadding`/`bottomPadding`/`leftPadding` 個別代入、または `flex.verticalPadding`/`horizontalPadding` |
| `board.position = { x, y }` が効かない | Board/Shape は non-extensible | `board.x = ...; board.y = ...;` |
| `catalog.addSet('name')` / `set.addToken('type','name','value')` で何も起きない | object 引数必須 | `catalog.addSet({name})` / `set.addToken({type, name, value})` または `storage.ensureTokenSet` / `storage.ensureToken` |
| `shape.applyToken(token, props)` が "check error" を出し tokens/fills 変化なし | `shape.applyToken` は動作しない | `storage.applyTokenSafe(shape, tokenOrName, props)`（`penpot.selection = [shape]` + `token.applyToSelected(props)`） |
| `token.applyToShapes(shapes, props)` を呼んでも tokens/fills 変化なし | `token.applyToShapes` は動作しない | `storage.applyTokenToShapesSafe(tokenOrName, shapes, props)` |
| `penpot.selection = shapes`（複数）+ `token.applyToSelected` で一部シェイプに反映されない | selection 一括指定は stroke 系やボード型を取りこぼす | `penpot.selection = [shape]` → `token.applyToSelected([prop])` の個別ループを使う（`storage.applyTokenToShapesSafe` はこの実装。大量時は件数×約250ms） |
| `[WARN] トークン未適用シェイプ N件` が `validateDesign` に出る | fill/stroke のハードコード色が残存 | 未適用シェイプに `applyTokenSafe` / `applyTokenToShapesSafe` で適用してから完了報告する（`tokenSets > 0` のとき `validateDesign` は自動でカバレッジを検査） |

## 補助 API リファレンス

penpotUtils / storage ラッパーと併用する Plugin API。

### Page
- `page.findShapes(criteria?)` — `{ name?, nameLike?, type? }` で絞り込み。例: `page.findShapes({ type: 'board' })` / `page.findShapes({ nameLike: 'Home' })`
  - 複雑な条件は `penpotUtils.findShapes(pred, root)`（述語関数）を使う
- `page.addCommentThread(content, position): Promise<CommentThread>` / `removeCommentThread(thread)` / `findCommentThreads(criteria?)` — コメントスレッド CRUD

### TokenSet / TokenCatalog
- `set.tokensByType: Array<[type, Token[]]>` — `Map.entries()` 形式。`new Map(set.tokensByType)` で Map 化可能
- `set.getTokenById(id): Token | undefined`
- `set.toggleActive()` — `active` 反転（永続化は `storage.switchThemePersistent`）
- `set.duplicate(): TokenSet` / `set.remove(): void`
- `catalog.getSetById(id)` / `catalog.getThemeById(id)`

### TokenTheme
- `theme.activeSets: TokenSet[]` — 非アクティブテーマでは空配列
- `theme.duplicate()` / `theme.remove()`

### Token (TokenBase)
- `token.description: string` — 作成時に `addToken({ type, name, value, description })` で指定可
- `token.resolvedValueString: string | undefined` — 全トークン共通の解決済文字列
- `token.duplicate(): Token` / `token.remove(): void`
- `token.applyToSelected(properties)` — `penpot.selection` に適用（ラッパーの内部実装）

### FlexLayout
- `flex.alignContent: 'center'|'start'|'end'|'stretch'|'space-between'|'space-around'|'space-evenly'`
- `flex.justifyItems: 'center'|'start'|'end'|'stretch'`
- `flex.horizontalSizing` / `verticalSizing` の値域: `'fill'|'auto'|'fit-content'`（`LayoutChildProperties` 側は `'fill'|'auto'|'fix'`）
- `layoutChild.verticalSizing` / `horizontalSizing` は直接代入で反映される

### Sizing 使い分け早見表

| 要件 | `layoutChild.horizontalSizing` | `layoutChild.verticalSizing` | 追加操作 |
|------|-------------------------------|------------------------------|---------|
| 親の残り幅/高さを占有 | `'fill'` | `'fill'` | — |
| コンテンツに応じた自動サイズ | `'auto'` | `'auto'` | テキストは `growType: 'auto-height'` / `'auto-width'` も併用 |
| 固定サイズ | `'fix'` | `'fix'` | `shape.resize(w, h)` で値指定 |
| 中央配置モーダル（親が mainAlign/crossAlign: center） | `'fix'` + `resize(w, h)` | `'auto'` | 幅を `'auto'` にすると 0 に潰れる |
| タッチターゲット 44×44 のアイコンボタン | `'fix'` | `'fix'` | `resize(44, 44)` + `fills = []` で透明化 |

### Shape
- `shape.switchVariant(pos, value)` / `combineAsVariants(ids)` / `isVariantHead()`
- `board.isVariantContainer(): boolean | null` — 通常 Board では `null` を返す（true/false でない点に注意）
- `penpot.flatten(shapes): Path[]`
- `penpot.replaceColor(shapes, oldColor, newColor)`
- `penpot.uploadMediaData(name, data, mimeType)` / `createShapeFromSvgWithImages(svgString)`

### Interaction
- `Action` union: `NavigateTo` / `OpenOverlay` / `ToggleOverlay` / `CloseOverlay` / `PreviousScreen` / `OpenUrl`
- `Trigger`: `'click' | 'mouse-enter' | 'mouse-leave' | 'after-delay'`
- `navigate-to` のみ `addInteraction` で保存される。overlay 系は保存されないため navigate-to で代替する

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
- `storage.api(command, params, timeout)` でタイムアウト付き呼び出し（activate 時に自動初期化済み）
- ファイル一覧: `get-project-files`（`get-files` は存在しない）
- `execute_code` から REST API を呼ぶ際は、mcp-connect コンテナ内のブリッジサーバー (port 3000) の `/api-proxy` を経由する。ブラウザセッションの Cookie が自動付与されるため、プラグイン側で認証情報を持つ必要がない。詳細は [selfhost.md の mcp-connect ブリッジサーバー](selfhost.md#mcp-connect-ブリッジサーバー) を参照

### update-file チェンジタイプ一覧

| チェンジタイプ | 用途 | 備考 |
|---|---|---|
| `del-component` | コンポーネント削除（ソフト） | ゴミ箱行き、復元可 |
| `purge-component` | コンポーネント完全削除 | 復元不可 |
| `del-page` | ページ削除 | Plugin API にページ削除なし |

### ライブラリ管理
- `createFile()` / `setFileShared()` / `linkLibrary()` / `unlinkLibrary()`

`storage.createFile()` で isShared 付きファイル作成、`storage.linkLibrary()` で接続。
コード例 → [howto: ライブラリ管理](../howto/library-management.md)

- `getCurrentProjectId()`: 接続中ファイルと同じプロジェクトにライブラリ作成
- `getTeamId()`: Shared Workspace チームを優先
- `get-file-libraries` は推移的依存も返す（重複表示されるが実害なし）
- `duplicateFile` は全ページ・接続を引き継ぐ → 不要ページ（`del-page`）・不要接続（`unlinkLibrary`）を整理

### ファイル切替
- `storage.openFile(projectId, fileId)` → ブリッジサーバーの `/navigate` エンドポイントを呼び出し、Playwright がワークスペース URL を遷移 → MCP 再接続発生（10-15秒）
- `storage.waitForReconnect()` でブリッジサーバーの `/status` を polling し、`ready` になるまで待機
- 再接続後、MCP ツールを呼び出して接続確認。エラー時のみ `/mcp` → Reconnect を案内。`activate` 再呼び出しで storage ラッパー再初期化が必要

### 画像エクスポート
- `board.export({ type: 'png', scale: 1.5 })` 推奨（2100x1500相当）

### テキスト色変更
REST API で作成されたテキストは content-level に色情報が埋め込まれており、`shape.fills` / `range.fills` 変更が反映されない場合がある。確実な方法は **テキスト削除→再作成**。

### TextRange.align
- `range.align = 'center' | 'right' | 'justify'` は代入エラーにならないが反映されない（Plugin API の既知制約。方向を問わず無効）
- **回避策**:
  - 中央寄せ: 親Flex board の `alignItems: 'center'` + テキストの `growType: 'auto-width'`
  - 右寄せ: 親を flex-row にして `mainAlignment: 'end'`、または親に `justifyContent: 'end'` を設定
  - 長文で右寄せしたい場合は、テキスト幅を親一杯に広げる（`horizontalSizing: 'fill'`）+ 親の配置で寄せる方が安定

### イベントリスナー
```javascript
const id = penpot.on('pagechange', callback);   // → symbol
penpot.off(id);                                   // 解除
// イベント: pagechange, selectionchange, shapechange, themechange, documentsaved
```

