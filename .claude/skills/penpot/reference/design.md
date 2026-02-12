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

曖昧な場合は [questions-guide.md](questions-guide.md) のフレームワークに従ってヒアリングする。
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
実装時は [penpot-recipes.md](penpot-recipes.md) のユーティリティを初期化し、デザイン原則に基づいて作成する。

**実装ルール:**
- フォント: **`fontFamily: "sourcesanspro"` のみ使用**（セルフホスト固有）
- スペーシング: 4px/8pxグリッドシステム（4, 8, 12, 16, 24, 32, 48, 64）
- カラー: 既存のセマンティックカラートークン（ライブラリカラー）を優先使用
- レイアウト: Flex/Gridレイアウトを積極活用
- **ページ作成: `storage.createAndOpenPage(name)` 必須**（`createPage()` 単体は切替されない）
- ページ切替: `penpot.openPage(page, false)` — 第2引数 `false` 必須
- **API制約**: `high_level_overview` のシステムプロンプトを必ず遵守（insertChild、growType、Flex順序等）

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

## セマンティックカラートークン

ライブラリに定義済みの14色トークン。`penpot.library.local.colors` から取得して `asFill()` / `asStroke()` で適用する。

| トークン | 用途 |
|---------|------|
| surface-primary | ページ背景 |
| surface-card | カード・パネル背景 |
| surface-secondary | セカンダリ背景・区切り |
| surface-info | 情報パネル背景 |
| text-heading | 見出しテキスト |
| text-primary | 本文テキスト |
| text-secondary | 補助テキスト |
| text-on-accent | アクセント背景上のテキスト |
| accent-blue | プライマリアクセント・CTA |
| accent-green | 成功・ポジティブ |
| accent-error | エラー・警告 |
| accent-error-light | エラー背景 |
| border-primary | 主要ボーダー |
| border-light | 軽いボーダー・区切り線 |

### トークン取得ヘルパー

```javascript
// カラートークンを名前で取得
function getToken(name) {
  return penpot.library.local.colors.find(c => c.name === name);
}

// 使用例
const fill = getToken('accent-blue').asFill();
shape.fills = [fill];
```

## タイポグラフィスケール

全て `fontFamily: "sourcesanspro"` を使用:

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
