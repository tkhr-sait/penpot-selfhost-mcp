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

### テーマ作成・テーマ切替

```javascript
const catalog = penpot.library.local.tokens;

// セット作成（Shared → Dark → Light: カタログ順で後のセットが優先されるため、ベースを先に作成）
const { set: sharedSet } = await storage.ensureTokenSet('Shared');
const { set: darkSet } = await storage.ensureTokenSet('Dark');
const { set: lightSet } = await storage.ensureTokenSet('Light');

// テーマ非依存のトークンは Shared に
await storage.ensureToken(sharedSet, 'spacing', 'spacing.md', '16');
// 同名トークンを Dark/Light 両セットに定義（カタログ順で Shared より後 → 上書き可能）
await storage.ensureToken(darkSet, 'color', 'color.bg.primary', '#1A1A2E');
await storage.ensureToken(lightSet, 'color', 'color.bg.primary', '#FFFFFF');

// テーマ作成（引数は2つの文字列）
catalog.addTheme('Appearance', 'Dark');
catalog.addTheme('Appearance', 'Light');
const darkTheme = catalog.themes.find(t => t.name === 'Dark');
const lightTheme = catalog.themes.find(t => t.name === 'Light');

// テーマにセットを関連付け（addSet の順序は優先度に影響しない）
darkTheme.addSet(sharedSet);
darkTheme.addSet(darkSet);
lightTheme.addSet(sharedSet);
lightTheme.addSet(lightSet);

// テーマ切替はセットの active で制御
// ⚠ theme.toggleActive() は WebSocket 切断を起こすため使用禁止
darkSet.active = true; lightSet.active = false; sharedSet.active = true;  // Dark
// darkSet.active = false; lightSet.active = true; sharedSet.active = true; // Light
```

### スペーシングルール
`storage.spacing` (xs:4 〜 3xl:64) をプロジェクト標準として定義。

定義するトークンの具体値は [design.md](../design.md) を参照。

## 成果物
- デザイントークンセット（Penpot Native Design Tokens）
- テーマ定義（Dark / Light 等）
- スペーシングルール定義
