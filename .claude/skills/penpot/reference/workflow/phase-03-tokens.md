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

`penpot-init.js` 初期化後:

### トークンの登録（ネイティブ API）

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

### スペーシングルール
`storage.spacing` (xs:4 〜 3xl:64) をプロジェクト標準として定義。

定義するトークンの具体値は [design.md](../design.md) を参照。

## 成果物
- デザイントークンセット（Penpot Native Design Tokens）
- スペーシングルール定義
