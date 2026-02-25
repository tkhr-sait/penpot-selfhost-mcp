# Recipe: トークン一括登録

セマンティックトークンを冪等に一括登録し、シェイプに適用する。
API 制約 → [mcp-api.md #トークン](../mcp-api.md#トークン)

## コード例

```javascript
// セット取得/作成（同名なら再利用）
const { set } = await storage.ensureTokenSet('Semantic');

// 単一登録（既存なら値を更新、同値ならスキップ）
await storage.ensureToken(set, 'color', 'color.primary', '#3B82F6');
await storage.ensureToken(set, 'spacing', 'spacing.sm', '8');

// 一括登録
await storage.ensureTokenBatch(set, [
  { type: 'color', name: 'color.success', value: '#22C55E' },
  { type: 'spacing', name: 'spacing.lg', value: '24' }
]);

// 適用（名前指定、null チェック・互換性チェック付き）
await storage.applyTokenSafe(shape, 'color.primary', ['fill']);

// 概観確認
return penpotUtils.tokenOverview();
```

## 注意点

- 全 `ensure*` 関数は冪等 — 同じスクリプトを2回実行しても安全
- トークンタイプ→適用プロパティ対応 → [mcp-api.md #トークン](../mcp-api.md#トークン)
- 大量登録は `ensureTokenBatch` が内部で 10件バッチ + 200ms sleep を行うため明示的な sleep は不要
