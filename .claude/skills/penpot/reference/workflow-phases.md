# ワークフロー各フェーズ 詳細手順

各フェーズの具体的な作業内容、Penpotでの操作、MCP活用手順、成果物を記載する。

全フェーズ共通で **`penpot-init.js` を最初に `execute_code` で初期化** する前提。

---

## Phase 01: 監査・棚卸し（Audit）

### 目的
「いま何があって、何が揃っていて、何がバラバラなのか」を明らかにする。

### 作業手順

#### 1. 既存UIの収集
- 過去のプロダクト・プロジェクトの画面をスクリーンショットやデザインファイルとして収集
- 対象: ボタン、フォーム、カード、モーダル、ナビゲーション、テーブル、アラート等
- Penpotに新しいプロジェクトを作成し、収集した要素を貼り付けて一覧化

#### 2. 重複・不整合の洗い出し
- 同じ役割のUI要素を並べて比較
- 典型的なバラつきパターン:
  - 同じ「送信ボタン」なのにページごとに色やサイズが違う
  - 似たカードコンポーネントが3種類以上存在
  - フォントサイズの規則性がない
  - 余白やパディングが場所ごとに異なる
- バラつきを赤枠やラベルで可視化し、統一すべきポイントをマーク

#### 3. カテゴリ分類
以下のカテゴリに分類する:
- カラー（ブランド、UI、セマンティック）
- タイポグラフィ（見出し、本文、キャプション）
- アイコン
- スペーシング / グリッド
- UIパターン（ボタン、フォーム、カード、ナビゲーション等）

#### 4. デザイン判断のヒアリング
- デザイナー・開発者に「なぜその色/余白/レイアウトを選んだか」を確認
- 暗黙知をドキュメント化
- 進行中のアイテムや未使用だが有用な要素も洗い出す

### MCP による自動監査

`penpot-init.js` を初期化後、`execute_code` で既存デザインをプログラム的に分析:

#### カラー使用状況の収集
全シェイプの fills/strokes を走査し、使用色を集計。`penpotUtils.findTokenByName()` でネイティブデザイントークンと突合し、未登録色を検出。

#### フォント・テキスト不整合の検出
`validate-design.js` を実行し、fontFamily/サイズ/growType の違反を自動検出。

#### コンポーネント使用状況
`penpot.library.local.components` を走査し、利用・未利用を集計。

#### ビジュアルキャプチャ
`export_shape` で主要ボードをエクスポートし、現状を記録。

### 成果物
- UIインベントリ（Penpotファイル）
- 不整合リスト（MCP自動検出結果含む）
- カテゴリ分類表

### 新規プロダクトの場合
過去の資産がない場合は以下に置き換え:
- 競合プロダクトのUI分析
- 業界のデザインパターンベンチマーク
- ターゲットユーザーの期待値調査

---

## Phase 02: ラフスケッチ・ワイヤーフレーム

### 目的
棚卸し結果をもとにデザインシステムの方向性や画面構成をラフに可視化する。

### 作業手順

#### 1. ラフスケッチ
- 紙・ホワイトボード・Penpotのフリーハンド描画を使用
- 画面構成やレイアウトパターンのアイデアを素早く発散
- 精度よりも量を重視し、複数案を出す

#### 2. ワイヤーフレーム作成
- Penpot上でローファイなワイヤーフレームを作成
- Flex Layout / Grid Layout を活用してコンテンツ配置を検討
- ビジュアルより構造（情報階層）を優先
- グレースケールで作成し、色やスタイルはTokens定義フェーズに委ねる

#### 3. パターンの方向性決定
- 繰り返し使われそうなUIパターンを特定
- コンポーネント化の候補をリストアップ
- チームでレビューし、次のTokens定義フェーズの入力とする

### MCP によるワイヤーフレーム作成

`penpot-init.js` 初期化後、「デザイン作成」ワークフロー（理解→設計→実装→レビュー）を使用:

- `storage.createAndOpenPage('Wireframes')` でワイヤーフレーム用ページ作成
- Board + Flex/Grid レイアウトで構造定義
- Rectangle（グレー塗り）でプレースホルダー配置
- `storage.createText()` でラベル・見出し配置
- `storage.spacing` を基準にグリッド準拠のスペーシング適用
- `export_shape` で確認

### 成果物
- ラフスケッチ集
- ローファイワイヤーフレーム（Penpotファイル）
- コンポーネント候補リスト

---

## Phase 03: Design Tokens の定義

### 目的
デザインシステムの最小単位となるトークンをPenpotのネイティブデザイントークン機能で定義・管理する。

### Penpotでの操作

#### デザイントークン（ネイティブ）
1. Design Tokens パネルでトークンセット・テーマを管理
2. トークンタイプ: color, dimension, spacing, typography, shadow, opacity, borderRadius, borderWidth, fontWeights, fontSizes, fontFamilies, letterSpacing, textDecoration, textCase
3. トークンをシェイプに適用 → トークン値の変更がシェイプに自動反映

#### スペーシング・レイアウト
1. Flex Layout / Grid Layout のルールを標準化
2. CSS Grid がPenpotでネイティブサポート
3. コンテナ間の余白やレスポンシブ挙動を定義

### MCP によるトークン一括登録

`penpot-init.js` 初期化後:

#### トークンの登録（ネイティブ API）

```javascript
// トークンカタログ
const catalog = penpot.library.local.tokens;

// セット作成
const set = catalog.addSet('Semantic');

// カラートークン
set.addToken('color', 'color.primary', '#3B82F6');
set.addToken('color', 'color.error', '#EF4444');

// スペーシングトークン
set.addToken('spacing', 'spacing.sm', '8');
set.addToken('spacing', 'spacing.md', '16');

// セット有効化
if (!set.active) set.toggleActive();

// トークン適用
const token = penpotUtils.findTokenByName('color.primary');
shape.applyToken(token, ['fill']);

// 概観確認
penpotUtils.tokenOverview();
```

#### スペーシングルール
`storage.spacing` (xs:4 〜 3xl:64) をプロジェクト標準として定義。

定義するトークンの具体値は [design.md](design.md) を参照。

### 成果物
- デザイントークンセット（Penpot Native Design Tokens）
- スペーシングルール定義

---

## Phase 04: コンポーネント設計・構築

### 目的
再利用可能なUIコンポーネントをPenpot上で構築する。

### Penpotでの操作

#### コンポーネント作成
1. オブジェクトまたはグループを選択
2. Assetsパネル → 「コンポーネントとして保存」
3. ネスト構造（親子関係）も対応
4. レイアウトルールのみの空ボードもコンポーネント化可能

#### バリアントの追加
1. コンポーネントにバリアントを追加
2. 状態管理: hover, active, disabled, focus 等
3. サイズ違い: small, medium, large
4. ファイル肥大化を防ぎつつ状態を一元管理

#### 命名規則
- スラッシュ区切りで階層化: `Button / Primary / Large`
- 検索しやすい構造にする
- チーム全体で規則を統一

### MCP によるコンポーネント構築

`penpot-init.js` 初期化後、「デザイン作成」ワークフロー（理解→設計→実装→レビュー）に従い:

1. `storage.createAndOpenPage('Components')` でコンポーネント展示ページ作成
2. `penpotUtils.findTokenByName()` + `shape.applyToken(token, ['fill'])` でトークンカラー適用
3. `storage.createText()` でコンポーネント内テキスト作成
4. `storage.spacing` でパディング・マージン統一
5. `penpot.library.local.createComponent(shapes)` でコンポーネント化
6. `component.transformInVariant()` でバリアント化
7. `variant.addVariant()` / `variant.addProperty()` でバリエーション追加
8. `validate-design.js` でフォント・テキスト検証
9. `export_shape` で各バリアントを確認

### 成果物
- コンポーネントライブラリ（Penpot Components）
- バリアント定義
- 命名規則ドキュメント

---

## Phase 05: ライブラリ構成・共有

### 目的
デザインシステムを分割ライブラリとして構成し、チーム全体で共有・同期する。

詳細なライブラリ構成は [library-architecture.md](library-architecture.md) を参照。

### Penpotでの操作

#### 分割ライブラリの作成
- ブランド / カラー / タイポグラフィ / UIパターンを別ファイル（=別ライブラリ）に分離
- プロジェクトに応じて必要なライブラリだけを接続

#### Connected Libraries の設定
1. ライブラリ間の依存関係を設定
2. 接続例: カラートークンLib → ブランドLib → UIコンポーネントLib
3. 更新通知で自動同期

#### Shared Libraries で公開
1. ローカルライブラリを Shared Library として公開
2. チーム全体のプロジェクトからアクセス可能
3. 接続先からはアセット編集不可（読み取り専用）

### MCP によるライブラリ操作

#### ローカルライブラリの管理
`penpot.library.local` でコンポーネントを管理。カラー・タイポグラフィはネイティブデザイントークンで管理（Phase 03 参照）。

#### 外部ライブラリの接続

```javascript
const available = await penpot.library.availableLibraries();
const lib = await penpot.library.connectLibrary(id);
```

#### 接続ライブラリのアセット利用
`lib.components` から取得し、`instance()` で適用。

### REST API によるライブラリ管理

`penpot-rest-api.js` を初期化すれば、ファイル作成・共有設定・ライブラリ接続が MCP で完結する。

1. **ライブラリファイル作成**: `await storage.createFile(projectId, 'UI Components Lib', { isShared: true })`
2. **ライブラリ接続**: `await storage.linkLibrary(originalFileId, libFileId)`

#### openFile 方式（コンポーネント登録等、Plugin API が必要な場合）

1. **ファイル切替**: `await storage.openFile(projectId, newFileId)` — MCP 再接続が発生（10-15秒）
2. **再接続**: `/mcp` → `penpot-official` → Reconnect → `penpot-init.js` + `penpot-rest-api.js` を再初期化
3. **アセット登録**: Plugin API でコンポーネント等を登録
4. **元ファイルに戻る**: `await storage.openFile(projectId, originalFileId)` → 再接続 → 再初期化
5. **ライブラリ接続**: `await storage.linkLibrary(originalFileId, libFileId)`

### 成果物
- 分割ライブラリ構成
- ライブラリ依存関係マップ
- 公開済み Shared Libraries

---

## Phase 06: プロトタイピング・検証

### 目的
共有ライブラリのコンポーネントでプロトタイプを構築し、ユーザーやステークホルダーと検証する。

### Penpotでの操作

#### インタラクション設定
1. プロトタイピングモードに切替
2. クリック、ホバー、画面遷移などのインタラクションを定義
3. バリアント切替で状態変化を表現

#### フロー構築
1. ユーザーフロー全体をプロトタイプとして組み立て
2. 実際の操作感を再現
3. 共有リンクでブラウザ上でそのまま体験可能

#### レビュー・フィードバック
1. Penpotのコメント機能で直接フィードバック
2. デザイナー・開発者・ステークホルダーが同一画面で議論
3. ユーザビリティテストの結果を反映しコンポーネントを改善

### MCP によるプロトタイプ構築

`penpot-init.js` 初期化後:

#### ページ管理
`storage.createAndOpenPage('Prototype')` でプロトタイプ用ページ作成。複数ページ作業時は `storage.assertCurrentPage()` でガード。

#### インタラクション設定
`execute_code` でシェイプにインタラクションを追加:

```javascript
shape.addInteraction(trigger, action, delay?);
// 例: クリックで別ボードに遷移
```

> **重要**: 起点と遷移先は同一ページ内に配置すること。

#### レビュー
`validate-design.js` で検証 → `export_shape` でエクスポート。`storage.getFileComments()` で未解決フィードバックを確認。

### 成果物
- インタラクティブプロトタイプ（Penpot）
- 共有リンク
- フィードバック・改善ログ

---

## Phase 07: デザイン → コード ハンドオフ

### 目的
PenpotのオープンスタンダードでスムーズなDev Handoffを実現する。

### Penpotでの操作

#### Inspect タブ
1. 開発者はInspectタブからSVG、CSS、HTMLコードを即時取得
2. デザインがそのままWeb標準コードに変換

#### Webhook / API 連携
1. Penpotのwebhooksでイベント通知
2. アクセストークンAPIでプログラムからアクセス
3. CI/CDパイプラインやコード生成ツールと連携

#### MCP Server（実験的）
1. Penpot MCP Serverを使用
2. AIアシスタント経由でデザイン↔コード↔ドキュメントの双方向変換
3. Storybookプロジェクトの自動生成
4. LLM非依存（Claude, Cursor等で利用可）

### MCP によるコード生成

`penpot-init.js` 初期化後:

#### CSS 生成

```javascript
penpot.generateStyle(shapes, { type: 'css', withChildren: true });
```

#### HTML/SVG マークアップ生成

```javascript
penpot.generateMarkup(shapes, { type: 'html' });
penpot.generateMarkup(shapes, { type: 'svg' });
```

#### トークン→コード変換
`penpotUtils.findTokenByName(name)` でトークン名から値を取得し、CSS カスタムプロパティや設計変数として出力。`penpotUtils.tokenOverview()` でトークン一覧を確認。

#### デザイン仕様のプログラム抽出
シェイプの fills/strokes/fontSize 等を `execute_code` で走査し、仕様書を自動生成。

### 成果物
- コードスニペット（CSS/HTML/SVG）
- API連携設定
- 開発者向けハンドオフドキュメント

---

## Phase 08: 運用・メンテナンス

### 目的
デザインシステムを「生きたドキュメント」として継続的に改善する。

### 作業手順

#### 定期レビューサイクル
- 月次または四半期でデザインシステムの利用状況をレビュー
- 非推奨コンポーネントの廃止を判断
- 新パターンの追加を検討

#### 変更ログとバージョニング
- ライブラリ更新時にCHANGELOGを記録
- Connected Librariesの通知機能で各プロジェクトへ変更を伝搬
- Gitと連携してバージョン管理

#### コントリビューションガイド
- 新コンポーネントの提案プロセスを文書化
- レビュー基準を明確化
- 命名規則・品質基準を維持

### MCP による自動監査・メンテナンス

`penpot-init.js` 初期化後:

#### validate-design.js で定期チェック
フォント・テキストサイズ・growType の違反を自動検出。

#### 一貫性チェック（拡張）
- `penpotUtils.findTokenByName()` / `penpotUtils.tokenOverview()` でネイティブトークンと実使用色を突合 → 未登録カラー検出
- `storage.spacing` の値で parentX/parentY を検証 → グリッド逸脱検出
- `penpotUtils.analyzeDescendants()` でボード単位の制約検証

#### 未対応フィードバック確認
`storage.getFileComments()` で全ページの未解決コメントを取得し、対応状況を確認。

### 成果物
- レビュー議事録
- CHANGELOG
- コントリビューションガイドドキュメント
