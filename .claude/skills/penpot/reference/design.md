# デザインワークフロー & 原則リファレンス

Penpot MCP でのUI/UXデザイン作成に関するワークフロー、デザイン原則、トークン定義。

## ワークフロー

### Phase 1: 理解

ユーザーの指示を分析し、具体性レベルを判定する:

**具体的な指示**（即実行）:
- 「1280x800のダッシュボード画面を作って。サイドバー付き、メインエリアにカード4枚」
- 「Primaryボタンコンポーネント: 青背景、白テキスト、角丸8px」

**曖昧な指示**（ヒアリング必要）:
- 「ログイン画面を作って」→ デバイスターゲット、ブランドカラー、必要フィールドを確認
- 「いい感じのUI作って」→ 目的、ターゲットユーザー、コンテンツを確認

曖昧な場合は以下の観点でヒアリングする:
- **目的**: 何のための画面か
- **ターゲット**: 使うのは誰か
- **デバイス**: モバイル / タブレット / デスクトップ
- **コンテンツ**: 表示する主要なデータや要素
**質問は一度に3つ以内**、選択肢を提示して回答しやすくする。AskUserQuestion ツールを活用。

### Phase 2: 設計

デザイン方針を簡潔にユーザーに提示する:
- レイアウト構成（ワイヤーフレームの説明）
- 使用するカラートークン
- タイポグラフィ（見出し・本文のサイズ）
- 主要コンポーネント一覧

小規模な変更や具体的な指示の場合はこのフェーズをスキップして良い。

### Phase 3: 実装

Penpot MCP (`mcp__penpot-official__execute_code`) を使ってデザインを作成する。
`mcp__penpot-official__activate` で storage ラッパーが自動初期化される。
下記の「実装ルール」とデザイン原則に従って作成する。

**大規模デザインの実装戦略:**
- 一度のexecute_codeで全てを作ろうとしない
- ボード作成 → セクションごとに子要素追加 → スタイル調整、と段階的に実行
- 中間結果を `storage` に保存して後続で参照

### Phase 4: レビュー

1. `mcp__penpot-official__export_shape` でデザインをPNGエクスポート
2. エクスポート結果を確認し、問題があれば修正
3. ユーザーに結果を共有し、フィードバックを求める

**よくある問題のチェック:**
- テキストがはみ出していないか
- 要素が意図通り配置されているか
- カラーコントラストが十分か

## デザイン原則

### 情報階層
- 見出しは大きく太く、本文は読みやすいサイズに
- 重要な情報ほど視覚的に目立たせる
- 適切なホワイトスペースで要素を分離

### 一貫性
- スペーシングは4px/8pxグリッドに従う
- カラーはセマンティックトークンを使用
- 同じ役割の要素には同じスタイルを適用

### アクセシビリティ
- テキストと背景のコントラスト比を確保（WCAG AA: 4.5:1以上）
- タッチターゲットは最低44x44px
- テキストは最小12px（推奨14px以上）

### レスポンシブ考慮
- モバイル: 375px幅
- タブレット: 768px幅
- デスクトップ: 1280px〜1440px幅
- 指定がなければデスクトップ(1280px)をデフォルトとする

## ベストプラクティス

- **スラッシュ命名で階層化**: `Category / Subcategory / Name` でAssetsを自動グルーピング
- **Shared Lib は読み取り専用**: 接続先からアセット編集不可。誤変更を防止
- **空ボードもコンポーネントに**: レイアウトルールだけのボードも保存可能
- **CSS Grid ネイティブサポート**: デザインとコードのレイアウトが完全一致

## 実装ルール

### フォント
- **`fontFamily: "sourcesanspro"` のみ**（セルフホスト環境の唯一のビルトインフォント）

### スペーシング
- 4px/8px グリッドシステム（4, 8, 12, 16, 24, 32, 48, 64）

### カラー・トークン
- 既存のセマンティックカラートークン（下記）を優先使用

### レイアウト
- Flex/Grid レイアウトを積極活用

### ページ管理
- プロトタイプ: インタラクションは同一ページ内のみ（異なるページ間は動作しない）
- API 詳細（createAndOpenPage, openPage, assertCurrentPage 等）は [mcp-api.md](mcp-api.md) のページ操作を参照

### ライブラリ管理
- カラー・タイポグラフィはネイティブ Design Tokens で管理（ライブラリファイル不要）
- コンポーネントは共有ライブラリで管理
- コンポーネント命名: `path` と `name` を個別に設定（スラッシュ記法の `name` 一括設定は path 二重化の原因）
- 詳細は [mcp-api.md](mcp-api.md) と [library-architecture.md](library-architecture.md) を参照

### API 制約
- MCP システムプロンプト（`mcp__penpot-official__high_level_overview`）を必ず遵守（insertChild、growType、Flex順序等）

## テーマ切替戦略

ダーク/ライトテーマの切替は **トークンセットの active 制御** で実現する。

### 原則: ボードは 1 つ
- **ボードを複製して Light 版/Dark 版を作らない** — 同一ボードでトークンセットの ON/OFF を切り替える
- Light 用に別コンポーネントやボードを手作りする必要はない
- 同じシェイプにセマンティックトークンを適用し、セット切替で外観が自動的に変わる

### アンチパターン
- Light 用ボード + Dark 用ボードを別々に作成する
- テーマごとに色をハードコードした複数のコンポーネントを作る
- export_shape でテーマ確認するために別ボードを用意する

### 正しいパターン
1. セマンティックトークン（surface-primary, text-heading 等）を Light/Dark セットに同名で定義
2. 全シェイプにトークンを適用（ハードコードの色は使わない）
3. `switchThemePersistent` でセットを切り替え → 同一ボードの見た目が変わる
4. `export_shape` で確認 → セット切替 → 再度 `export_shape` で別テーマ確認

### その他
- テーマ非依存のトークン（spacing, borderRadius 等）は Shared セットにまとめる
- **永続化の制約**: Plugin API の `set.active` はリロードで失われる。詳細は [mcp-api.md](mcp-api.md) のテーマ管理・テーマ切替セクションを参照

## セマンティックカラートークン

ネイティブデザイントークンとして定義する14色。`storage.applyTokenSafe()` で安全に適用する。

| トークン | 用途 | Light | Dark |
|---------|------|-------|------|
| surface-primary | ページ背景 | `#FFFFFF` | `#1A1A2E` |
| surface-card | カード・パネル背景 | `#F8F9FA` | `#2D2D44` |
| surface-secondary | セカンダリ背景・区切り | `#E9ECEF` | `#16213E` |
| surface-info | 情報パネル背景 | `#E8F4FD` | `#1A3A5C` |
| text-heading | 見出しテキスト | `#1A1A2E` | `#F8F9FA` |
| text-primary | 本文テキスト | `#2D2D44` | `#E0E0E0` |
| text-secondary | 補助テキスト | `#6C757D` | `#9E9E9E` |
| text-on-accent | アクセント背景上のテキスト | `#FFFFFF` | `#FFFFFF` |
| accent-blue | プライマリアクセント・CTA | `#4A90D9` | `#6DB3F8` |
| accent-green | 成功・ポジティブ | `#28A745` | `#4CAF50` |
| accent-error | エラー・警告 | `#DC3545` | `#EF5350` |
| accent-error-light | エラー背景 | `#F8D7DA` | `#4A1C1C` |
| border-primary | 主要ボーダー | `#DEE2E6` | `#3D3D5C` |
| border-light | 軽いボーダー・区切り線 | `#E9ECEF` | `#2D2D44` |

> Light/Dark 値は Material Design 3 + WCAG AA 準拠を基本に選定。プロジェクトに合わせて調整可。
>
> コードからは `storage.SEMANTIC_TOKEN_DEFAULTS` で参照可能。一括登録は `storage.ensureSemanticTokens()` を使用。

### トークン取得・適用

```javascript
// シェイプに適用（文字列名を直接指定、null チェック・互換性チェック付き）
await storage.applyTokenSafe(shape, 'accent-blue', ['fill']);

// ストロークに適用
await storage.applyTokenSafe(shape, 'accent-blue', ['stroke-color']);

// 複数シェイプに一括適用
await storage.applyTokenToShapesSafe('accent-blue', [shape1, shape2], ['fill']);

// トークン一覧確認
penpotUtils.tokenOverview();
```

## タイポグラフィスケール

ネイティブタイポグラフィトークンとして登録する。全て `fontFamily: "sourcesanspro"` を使用:

| レベル | fontSize | fontWeight | 用途 |
|--------|----------|------------|------|
| Display | 48 | "bold" | ヒーローセクション |
| H1 | 32 | "bold" | ページタイトル |
| H2 | 24 | "semibold" | セクション見出し |
| H3 | 20 | "semibold" | カードタイトル |
| Body Large | 18 | "regular" | 強調本文 |
| Body | 16 | "regular" | 標準本文 |
| Body Small | 14 | "regular" | コンパクト本文 |
| Caption | 12 | "regular" | 注釈・ラベル |
| Overline | 11 | "semibold" | オーバーライン |
