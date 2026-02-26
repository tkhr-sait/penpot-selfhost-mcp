# MCP API Cookbook

Kanban アプリ構築を題材にした実行パターン集。各ステップは「やりたいこと → コード例 → 注意点」のフォーマット。
API 制約・メソッド一覧は [mcp-api.md](../core/mcp-api.md) を参照。

---

## Step 0: セッション開始と状態把握

**やりたいこと**: MCP セッションを開始し、既存のページ・トークン・コンポーネントを把握する。

`activate` を呼ぶと storage ラッパーが自動初期化され、利用可能になる。
戻り値の `context` で全体像を掴み、何が既にあるかを確認してから作業を始める。

```javascript
// 現在ページのボード一覧
const ctx = storage.getPageContext();
// → { page: {id, name}, boards: [{id, name, width, height}] }

// 利用可能なトークンを確認
const tokens = penpotUtils.tokenOverview();
// → { setName: { color: ['accent-blue', ...], spacing: [...] } }

return { pageContext: ctx, tokens };
```

**注意点**:
- `activate` 前に他の MCP ツールを使うとエラー。切断時も `activate` 再呼び出しで復帰
- `context` の情報を元に、既存ページの再利用 or 新規作成を判断する

---

## Step 1: ページ準備+ボード配置

**やりたいこと**: Kanban ページに 1440x900 のメインボードを作成する。

```javascript
const page = await storage.createAndOpenPage('Kanban Board');

const board = penpot.createBoard();
board.name = 'Main';
board.resize(1440, 900);
board.addFlexLayout();
board.flex.dir = 'row';
board.flex.columnGap = 24;
board.flex.padding = { top: 24, right: 24, bottom: 24, left: 24 };

return { pageId: page.id, boardId: board.id };
```

**注意点**:
- `width`/`height` は読取専用 → サイズ設定は `resize(w, h)`
- `createAndOpenPage` は `await` 必須。空の Page 1 があればリネームして再利用する
- ページ操作メソッド一覧 → [mcp-api.md #ページ操作](../core/mcp-api.md#ページ操作)

---

## Step 2: Flex で子要素を並べる

**やりたいこと**: 3カラム（To Do / In Progress / Done）を横並びに配置する。

```javascript
const columnNames = ['To Do', 'In Progress', 'Done'];
const columns = [];

for (const name of columnNames) {
  const col = penpot.createBoard();
  col.name = `Column-${name}`;
  col.resize(400, 100);
  col.addFlexLayout();
  col.flex.dir = 'column';
  col.flex.rowGap = 12;
  col.flex.padding = { top: 16, right: 16, bottom: 16, left: 16 };

  const lc = await storage.appendChild(mainBoard, col);
  lc.horizontalSizing = 'fill';
  lc.verticalSizing = 'fill';
  columns.push({ id: col.id, name });
}
return columns;
```

**注意点**:
- `storage.appendChild` は Flex/非Flex 判定 + sleep + `layoutChild` 返却を自動処理
- プロパティ名は `horizontalSizing` / `verticalSizing`（`hSizing` は無効）

---

## Step 3: テキスト・矩形で中身を作る

**やりたいこと**: カード内にタイトルと優先度バッジを配置する。

```javascript
// ヘルパー関数を storage に登録して再利用
storage.createCard = async (parent, title, priority) => {
  const card = penpot.createBoard();
  card.name = `Card-${title}`;
  card.resize(360, 80);
  card.addFlexLayout();
  card.flex.dir = 'column';
  card.flex.rowGap = 8;
  card.flex.padding = { top: 12, right: 12, bottom: 12, left: 12 };
  card.borderRadius = 8;
  card.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }];

  const titleText = storage.createText(title, { fontSize: 16, fontWeight: 'semibold', growType: 'auto-width' });
  const badge = storage.createText(priority, { fontSize: 12, fontWeight: 'bold' });

  const cardLc = await storage.appendChild(parent, card);
  cardLc.horizontalSizing = 'fill';
  await storage.appendChild(card, titleText);
  const badgeLc = await storage.appendChild(card, badge);
  // titleText の layoutChild を取得（appendChild 済みなので直接アクセス可）
  titleText.layoutChild.horizontalSizing = 'fill';
  return card;
};
```

**注意点**:
- テキストは必ず `storage.createText()`（`penpot.createText()` は 0x0 になる）
- `storage.appendChild` で sleep 内蔵のため、個別の sleep は不要

---

## Step 4: トークンで色を付ける

**やりたいこと**: セマンティックトークン（accent-blue, surface-card 等）をシェイプに適用する。

```javascript
const overview = penpotUtils.tokenOverview();

await storage.applyTokenSafe(card, 'surface-card', ['fill']);
await storage.applyTokenSafe(headerText, 'text-heading', ['fill']);
await storage.applyTokenSafe(card, 'border-light', ['stroke-color']);

return { applied: true };
```

**注意点**:
- `await` 必須（内部で 100ms sleep 実行）
- 未登録トークン名はエラー。`tokenOverview()` で事前確認
- トークンタイプ→プロパティ対応 → [mcp-api.md #トークン](../core/mcp-api.md#トークン)

---

## Step 5: インタラクションで画面遷移

**やりたいこと**: カードクリックで詳細画面（別ボード）に遷移する。

```javascript
// 詳細画面ボードを用意（同一ページ内に必要）
const detailBoard = penpot.createBoard();
detailBoard.name = 'Card Detail';
detailBoard.resize(1440, 900);

// カードにクリック→遷移インタラクションを設定
card.addInteraction(
  { type: 'click' },
  { type: 'navigate-to', destination: detailBoard }
);

// 戻るボタン
backButton.addInteraction(
  { type: 'click' },
  { type: 'previous-screen' }
);
return { interaction: 'navigate-to', target: detailBoard.id };
```

**注意点**:
- **同一ページ内のボード間のみ有効**（異なるページ間は動作しない）
- OpenOverlay / ToggleOverlay は Plugin API 未実装 → `navigate-to` で代替

---

## Step 6: テーマ切替

**やりたいこと**: Kanban の Light/Dark テーマを切り替える。

```javascript
// Dark テーマに永続切替
await storage.switchThemePersistent(['Shared', 'Dark'], ['Light']);

// 切替確認
const board = penpotUtils.findShapes(s => s.name === 'Main', penpot.currentPage.root)[0];
return { themeApplied: 'Dark', boardId: board.id };
```

Light に戻す: `await storage.switchThemePersistent(['Shared', 'Light'], ['Dark'])`

**注意点**:
- `set.active = bool` はセッション限定（リロードで失われる）
- 永続化は必ず `storage.switchThemePersistent()` を使う
- 個別セット切替: `await storage.toggleSetPersistent('Dark', true)`

---

## Step 7: レビュー・エクスポート

**やりたいこと**: 完成したボードを視覚確認しフィードバックを得る。

デザイン検証:
```javascript
const result = storage.validateDesign();
return result;
```

`mcp__penpot-official__export_shape` ツールで PNG エクスポート:
- `shapeId`: ボード ID または `'selection'`
- `format`: `'png'`（scale 1.5 推奨 → 2100x1500 相当）

未解決コメントの確認:
```javascript
const comments = await storage.getFileComments();
return comments.filter(c => !c.resolved);
```

**注意点**:
- `export_shape` は execute_code ではなく MCP ツールとして直接呼び出す
- コメント機能の詳細 → [comments.md](../core/comments.md)
