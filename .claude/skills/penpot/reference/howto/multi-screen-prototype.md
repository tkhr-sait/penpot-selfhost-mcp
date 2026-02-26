# Recipe: テーマ付き複数画面プロトタイプ

複数画面 + Light/Dark テーマ + インタラクションを含むプロトタイプの構築パターン。
API 制約 → [mcp-api.md](../core/mcp-api.md) / テーマ → [theme-setup.md](theme-setup.md) / トークン → [token-registration.md](token-registration.md)

## 概要

EC サイト（Home / Product Detail / Cart）を例にした構築フロー。
全画面を同一ページに配置し、セマンティックトークン + テーマ切替で Light/Dark 対応する。

**現実的な呼び出し回数（3画面 + テーマ）:**
- execute_code: 12〜15回（切断リトライ含め最大 ~25回）
- export_shape: 2〜4回（Light/Dark 各1回 + 修正後）

## Step 1: トークン + テーマ定義（1回）

**やりたいこと**: Shared / Light / Dark セットにセマンティックトークンを一括登録し、テーマを構築する。

```javascript
// デフォルト14色 + spacing + borderRadius を一括登録 + テーマ作成 + Light 永続切替
await storage.ensureSemanticTokens();

// カスタマイズが必要な場合:
// await storage.ensureSemanticTokens({
//   overrides: { 'accent-blue': { light: '#007AFF', dark: '#64B5F6' } },
//   includeTypography: true,  // fontSizes/fontWeights も登録
// });

return penpotUtils.tokenOverview();
```

**注意点**:
- `ensureSemanticTokens` は内部で `ensureTokenBatch`（10件バッチ + sleep）を使用
- 既存トークンは自動スキップ（`force: true` で上書き可能）
- トークン一覧は `storage.SEMANTIC_TOKEN_DEFAULTS` で参照可能
- 個別にトークンを登録したい場合は [token-registration.md](token-registration.md) を参照

---

## Step 2: ヘルパー登録（1回）

**やりたいこと**: 繰り返し使う UI パターンを storage ヘルパーとして登録する。

```javascript
if (!storage.__protoHelpers) {
  // カード生成ヘルパー
  storage.createProductCard = async (parent, { title, price, imageColor }) => {
    const card = penpot.createBoard();
    card.name = `Card-${title}`;
    card.resize(280, 320);
    card.addFlexLayout();
    card.flex.dir = 'column';
    card.flex.rowGap = 8;
    card.flex.padding = { top: 0, right: 0, bottom: 16, left: 0 };
    card.borderRadius = 12;

    // 画像プレースホルダ
    const img = penpot.createRectangle();
    img.name = 'Image';
    img.resize(280, 200);
    img.fills = [{ fillColor: imageColor, fillOpacity: 1 }];

    const titleText = storage.createText(title, { fontSize: 16, fontWeight: 'semibold' });
    const priceText = storage.createText(price, { fontSize: 18, fontWeight: 'bold' });

    const cardLc = await storage.appendChild(parent, card);
    cardLc.horizontalSizing = 'fill';
    await storage.appendChild(card, img);
    const titleLc = await storage.appendChild(card, titleText);
    titleLc.horizontalSizing = 'fill';
    titleLc.marginLeft = 16;
    await storage.appendChild(card, priceText);
    priceText.layoutChild.marginLeft = 16;
    return card;
  };

  storage.__protoHelpers = true;
}
return { helpersReady: true };
```

**注意点**:
- 冪等ガード（`if (!storage.__protoHelpers)`）で切断後の再実行に対応
- ヘルパーは必ず `async`（`storage.appendChild` が非同期のため）

---

## Step 3〜5: 各画面構築（画面あたり 2〜3回）

**やりたいこと**: Home / Product Detail / Cart の各画面を構築する。

全画面を同一ページ内のボードとして配置する（インタラクション対応）。

```javascript
// Step 3: Home 画面 — 骨格
const page = await storage.createAndOpenPage('EC Prototype');
const home = penpot.createBoard();
home.name = 'Home';
home.resize(1280, 800);
home.addFlexLayout();
home.flex.dir = 'column';
// ... NavBar + カードグリッド + Footer を構築

// Step 4: Product Detail 画面
const detail = penpot.createBoard();
detail.name = 'Product Detail';
detail.resize(1280, 800);
// ...

// Step 5: Cart 画面
const cart = penpot.createBoard();
cart.name = 'Cart';
cart.resize(1280, 800);
// ...

return { homeId: home.id, detailId: detail.id, cartId: cart.id };
```

**分割戦略**: 各画面を 1〜2回の execute_code で完了。骨格（ボード + Flex レイアウト）と中身（テキスト + シェイプ）を分けても良い。

---

## Step 6: トークン一括適用（1〜2回）

**やりたいこと**: 全画面の全シェイプにセマンティックトークンを適用する。

```javascript
// ボードを取得
const boards = penpotUtils.findShapes(s => s.type === 'board' && s.name !== '', penpot.currentPage.root);

for (const board of boards) {
  // 背景
  await storage.applyTokenSafe(board, 'surface-primary', ['fill']);

  // カード
  const cards = penpotUtils.findShapes(s => s.name?.startsWith('Card-'), board);
  for (const card of cards) {
    await storage.applyTokenSafe(card, 'surface-card', ['fill']);
  }

  // テキスト
  const texts = penpotUtils.findShapes(s => s.type === 'text', board);
  for (const t of texts) {
    const tokenName = t.fontSize >= 20 ? 'text-heading' : 'text-primary';
    await storage.applyTokenSafe(t, tokenName, ['fill']);
  }
}

return { applied: true };
```

**注意点**: 大量の `applyTokenSafe` 呼び出しは WebSocket 切断リスクがある。画面ごとに分割しても良い。

---

## Step 7: インタラクション設定（1回）

**やりたいこと**: 画面間のナビゲーションを設定する。

```javascript
const root = penpot.currentPage.root;
const home = penpotUtils.findShapes(s => s.name === 'Home', root)[0];
const detail = penpotUtils.findShapes(s => s.name === 'Product Detail', root)[0];
const cart = penpotUtils.findShapes(s => s.name === 'Cart', root)[0];

// Home → Product Detail（カードクリック）
const cards = penpotUtils.findShapes(s => s.name?.startsWith('Card-'), home);
for (const card of cards) {
  card.addInteraction({ type: 'click' }, { type: 'navigate-to', destination: detail });
}

// Product Detail → Cart（カートボタンクリック）
const cartBtn = penpotUtils.findShapes(s => s.name === 'CartButton', detail)[0];
if (cartBtn) cartBtn.addInteraction({ type: 'click' }, { type: 'navigate-to', destination: cart });

// 各画面の Logo → Home
for (const board of [detail, cart]) {
  const logo = penpotUtils.findShapes(s => s.name === 'Logo', board)[0];
  if (logo) logo.addInteraction({ type: 'click' }, { type: 'navigate-to', destination: home });
}

return { interactions: 'set' };
```

**注意点**: 同一ページ内のボード間のみ有効。異なるページ間は動作しない。

---

## Step 8: テーマ確認（switchThemePersistent + export_shape）

**やりたいこと**: Light / Dark 両テーマの見た目を export_shape で確認する。

1. Light テーマで `export_shape`（shapeId: Home ボード ID）
2. `switchThemePersistent` で Dark に切替:
   ```javascript
   await storage.switchThemePersistent(['Shared', 'Dark'], ['Light']);
   ```
3. Dark テーマで `export_shape`
4. 必要に応じて Light に戻す

**注意点**:
- `switchThemePersistent` は全画面構築・トークン適用が**完了してから**呼ぶ
- 切替後に storage カスタムヘルパーが消失する場合がある（WebSocket 復帰時）。修正が必要なら Step 2 を再実行
- 検証: `return storage.validateDesign()` で基本チェック
