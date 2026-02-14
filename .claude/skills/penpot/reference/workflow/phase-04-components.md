# Phase 04: コンポーネント設計・構築

## 目的
再利用可能なUIコンポーネントをPenpot上で構築する。

## Penpotでの操作

### コンポーネント作成
1. オブジェクトまたはグループを選択
2. Assetsパネル → 「コンポーネントとして保存」
3. ネスト構造（親子関係）も対応
4. レイアウトルールのみの空ボードもコンポーネント化可能

### バリアントの追加
1. コンポーネントにバリアントを追加
2. 状態管理: hover, active, disabled, focus 等
3. サイズ違い: small, medium, large
4. ファイル肥大化を防ぎつつ状態を一元管理

### 命名規則
- スラッシュ区切りで階層化: `Button / Primary / Large`
- 検索しやすい構造にする
- チーム全体で規則を統一

## MCP によるコンポーネント構築

`penpot-init.js` 初期化後、「デザイン作成」ワークフロー（理解→設計→実装→レビュー）に従い:

1. `storage.createAndOpenPage('Components')` でコンポーネント展示ページ作成
2. `storage.applyTokenSafe(shape, 'token-name', ['fill'])` でトークンカラー適用
3. `storage.createText()` でコンポーネント内テキスト作成
4. `storage.spacing` でパディング・マージン統一
5. `penpot.library.local.createComponent(shapes)` でコンポーネント化
6. `component.transformInVariant()` でバリアント化
7. `variant.addVariant()` / `variant.addProperty()` でバリエーション追加
8. `validate-design.js` でフォント・テキスト検証
9. `mcp__penpot-official__export_shape` で各バリアントを確認

## 成果物
- コンポーネントライブラリ（Penpot Components）
- バリアント定義
- 命名規則ドキュメント
