# Phase 03: Design Tokens の定義

## 目的
デザインシステムの最小単位となるトークンをPenpotのネイティブデザイントークン機能で定義・管理する。

## Penpotでの操作

### デザイントークン（ネイティブ）
1. Design Tokens パネルでトークンセット・テーマを管理
2. トークンタイプ: color, dimension, spacing, typography, shadow, opacity, borderRadius, borderWidth, fontWeights, fontSizes, fontFamilies, letterSpacing, textDecoration, textCase
3. トークンをシェイプに適用 → トークン値の変更がシェイプに自動反映

### スペーシング・レイアウト
1. Flex Layout / Grid Layout のルールを標準化
2. CSS Grid がPenpotでネイティブサポート
3. コンテナ間の余白やレスポンシブ挙動を定義

## MCP によるトークン一括登録

`penpot-init.js` + `token-utils.js` 初期化後:

### トークンの登録（ネイティブ API）

```javascript
// 冪等なセット取得/作成（同じスクリプトを2回実行しても安全）
const { set } = await storage.ensureTokenSet('Semantic');

// カラートークン（冪等: 既存なら値を更新、同値ならスキップ）
await storage.ensureToken(set, 'color', 'color.primary', '#3B82F6');
await storage.ensureToken(set, 'color', 'color.error', '#EF4444');

// スペーシングトークン
await storage.ensureToken(set, 'spacing', 'spacing.sm', '8');
await storage.ensureToken(set, 'spacing', 'spacing.md', '16');

// 一括登録も可能
await storage.ensureTokenBatch(set, [
  { type: 'color', name: 'color.success', value: '#22C55E' },
  { type: 'spacing', name: 'spacing.lg', value: '24' }
]);

// トークン適用（文字列名を直接指定、null チェック・互換性チェック付き）
await storage.applyTokenSafe(shape, 'color.primary', ['fill']);

// 概観確認
penpotUtils.tokenOverview();
```

### スペーシングルール
`storage.spacing` (xs:4 〜 3xl:64) をプロジェクト標準として定義。

定義するトークンの具体値は [design.md](../design.md) を参照。

## 成果物
- デザイントークンセット（Penpot Native Design Tokens）
- スペーシングルール定義
