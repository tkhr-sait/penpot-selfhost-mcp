# Recipe: テーマ構築

Dark/Light テーマを構築し、永続的に切り替えられるようにする。
API 制約 → [mcp-api.md #テーマ管理](../mcp-api.md#テーマ管理)

## 簡易版（推奨）

デフォルトのセマンティックトークンで十分な場合、1行で完了:

```javascript
await storage.ensureSemanticTokens();
// → Shared(spacing+borderRadius) / Light(14色) / Dark(14色) + テーマ作成 + Light 永続切替
```

カスタマイズが必要な場合:
```javascript
await storage.ensureSemanticTokens({
  overrides: { 'accent-blue': { light: '#007AFF', dark: '#64B5F6' } },
  includeTypography: true,  // fontSizes/fontWeights も登録
});
```

既存トークンは自動スキップ（`force: true` で上書き可能）。

## コード例（個別登録）

```javascript
// 1. セット作成（カタログ順で後のセットが優先→ベースを先に）
const { set: sharedSet } = await storage.ensureTokenSet('Shared');
const { set: darkSet } = await storage.ensureTokenSet('Dark');
const { set: lightSet } = await storage.ensureTokenSet('Light');

// 2. テーマ固有トークンを登録（同名トークンでテーマ値を分ける）
await storage.ensureToken(sharedSet, 'spacing', 'spacing.md', '16');
await storage.ensureToken(darkSet, 'color', 'color.bg.primary', '#1A1A2E');
await storage.ensureToken(lightSet, 'color', 'color.bg.primary', '#FFFFFF');

// 3. テーマ作成+セット関連付け（冪等）
const { theme: darkTheme } = await storage.ensureTheme('Appearance', 'Dark', [sharedSet, darkSet]);
const { theme: lightTheme } = await storage.ensureTheme('Appearance', 'Light', [sharedSet, lightSet]);

// 4. 永続切替
await storage.switchThemePersistent(['Shared', 'Dark'], ['Light']);
return { darkTheme: darkTheme.name, lightTheme: lightTheme.name };
```

## ボード戦略

テーマ切替はボード 1 つで行う。Light 用/Dark 用の別ボードは作成しない。
全シェイプにセマンティックトークンを適用し、`switchThemePersistent` でセットを切り替えることで同一ボードの見た目が変わる。
テーマ確認時は `export_shape` → セット切替 → 再 `export_shape` の手順で Light/Dark 両方を確認する。

## 注意点

- `ensureTheme` の `addSet` はセッション限定 — 永続化は `switchThemePersistent` で行う
- セット作成順序が重要: Shared を先に作成し、テーマ固有セットを後に（カタログ順で後が優先）
- テーマ切替パターン → [mcp-api.md #テーマ切替](../mcp-api.md#テーマ切替セットの-active-制御)
