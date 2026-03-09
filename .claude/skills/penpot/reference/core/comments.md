# レビュー & コメント操作リファレンス

> **実行境界**: このファイルの execute_code 操作は penpot-mcp サブエージェント内で実行すること。

デザインレビュー（エクスポート → チェックリスト評価 → コメント登録）と、
コメントの作成・取得・返信・解決を1ファイルに集約。

## レビューワークフロー

1. 下記「ボード・シェイプ取得」でレビュー対象のボードを特定
2. `export_shape` で対象ボードを PNG エクスポート
3. 下記「UI/UX チェックリスト」で評価し、指摘事項を洗い出す
4. 「コメント作成」セクションの手順で指摘をコメント登録
5. 「コメント取得」で登録結果を確認し、ユーザーにサマリを共有

テーマがある場合は `storage.switchThemePersistent()` で Light / Dark 両方を確認する。

## ボード・シェイプ取得

### ボード一覧の取得

```javascript
// ページ上の全ボードを取得（ID・名前・サイズ）
const ctx = storage.getPageContext();
return ctx;
// → { page: { id, name }, boards: [{ id, name, width, height }, ...] }
```

`boards[].id` を `export_shape` の `shapeId` に渡す。

### ボード内シェイプの検索

```javascript
// ⚠ board.findShapes() は存在しない — penpotUtils.findShapes() を使う
const boards = penpot.currentPage.findShapes({ type: 'board' });
const board = boards.find(b => b.name === 'Home');

// ボード配下の全シェイプを再帰検索
const allShapes = penpotUtils.findShapes(() => true, board);
return allShapes.map(s => ({ name: s.name, type: s.type, id: s.id }));
```

### シェイプ構造の確認

```javascript
const board = penpot.currentPage.findShapes({ name: 'Home', type: 'board' })[0];
return penpotUtils.shapeStructure(board, 3); // depth=3 で3階層まで表示
```

## UI/UX チェックリスト

エクスポート画像を以下の観点で評価する。デザインの文脈に応じて重要な項目を重点的に。

### レイアウト & スペーシング
- 余白が 4/8px グリッドに従っているか
- 要素間の間隔が統一されているか（同じ階層で異なる gap がないか）
- 左右・上下の余白が対称か
- 情報の視覚的グルーピングが適切か（近接の原則）

### タイポグラフィ
- フォントサイズの階層が明確か（見出し > 本文 > 補助）
- 行間（line-height）が詰まりすぎ / 空きすぎていないか
- テキストがコンテナからはみ出していないか
- フォントウェイトの使い分けが適切か（太字の乱用がないか）

### カラー & コントラスト
- テキスト/背景のコントラスト比が WCAG AA 以上（4.5:1）か
- セマンティックトークンが適用されているか（ハードコード値がないか）
- エラー・成功・情報の色使いが一貫しているか
- Dark テーマでもコントラストが十分か

### アクセシビリティ
- タッチターゲットが 44x44px 以上か
- テキストが最小 12px（推奨 14px）以上か
- 色だけに依存した情報伝達がないか（形状・ラベル併用）

### 一貫性
- 同じ役割の要素が同じスタイルを持っているか
- ボタン・カード等のコンポーネントが統一されているか
- アイコンサイズ・スタイルが揃っているか

### UX フロー（インタラクション付きの場合）
- ナビゲーションの導線が自然か
- CTA（主要アクション）が視覚的に目立っているか
- 戻る/キャンセルの手段が明確か

## コメント作成

`page.addCommentThread(content, position)` で任意の座標にコメントスレッドを作成する。

### 座標計算

`position` はキャンバスの**絶対座標**（`Point { x, y }`）。
ボード内の特定要素を指すには、ボードの座標にオフセットを加算する:

```javascript
// 要素の中心にコメントを配置
function commentPosition(shape) {
  return { x: shape.x + shape.width / 2, y: shape.y };
}

// ボード内の相対位置（左上からの %）
function boardRelativePosition(board, xPct, yPct) {
  return {
    x: board.x + board.width * xPct,
    y: board.y + board.height * yPct
  };
}
```

### addReviewComment — レビュー指摘の一括登録

```javascript
// ヘルパー: ボード内の相対位置にコメントを作成
storage.addReviewComment = async (board, content, xPct, yPct) => {
  const pos = {
    x: board.x + board.width * xPct,
    y: board.y + board.height * yPct
  };
  return await penpot.currentPage.addCommentThread(content, pos);
};

// 使用例: 複数指摘を一括登録
const board = penpot.currentPage.findShapes({ name: 'Home', type: 'board' })[0];
const threads = [];

threads.push(await storage.addReviewComment(
  board,
  '[UI] ヘッダーとコンテンツ間の余白が 20px — 8px グリッド（16px or 24px）に揃えてください',
  0.5, 0.08
));

threads.push(await storage.addReviewComment(
  board,
  '[A11y] 補助テキストのコントラスト比が不足（推定 3.2:1）— WCAG AA 4.5:1 以上に',
  0.3, 0.45
));

return threads.map(t => ({ seq: t.seqNumber, position: t.position }));
```

### 特定シェイプへのコメント配置

```javascript
// 名前で要素を検索してその位置にコメント
const target = penpot.currentPage.findShapes({ nameLike: 'Button' })[0];
if (target) {
  await penpot.currentPage.addCommentThread(
    '[UX] CTA ボタンが視覚的に弱い — accent-blue + 太字で強調を推奨',
    { x: target.x + target.width, y: target.y }
  );
}
```

**注意**: `addCommentThread` は `await` 必須。1回の execute_code で複数登録可能（10件超は WebSocket 切断リスクあり → 分割）。

## コメント取得・返信・解決

```javascript
// 1. ファイル全体の未解決コメントを取得（ページ横断）
const allComments = await storage.getFileComments();
return allComments;
```

結果から該当ページに移動後:

```javascript
// 2. 該当ページのスレッドを取得
const threads = await penpot.currentPage.findCommentThreads({
  showResolved: false
});
return threads.map(t => ({
  seq: t.seqNumber,
  position: t.position,
  resolved: t.resolved,
  board: t.board?.name
}));
```

```javascript
const threads = await penpot.currentPage.findCommentThreads({ showResolved: false });
// 返信
await threads[0].reply('修正しました。');
// 解決済みにする
threads[0].resolved = true;
```

## コメント削除

```javascript
// スレッドごと削除（作成者のみ可能）
await penpot.currentPage.removeCommentThread(thread);
// 個別コメント削除
const comments = await thread.findComments();
comments[1].remove(); // 2番目のコメントを削除
```

## フォーマット規約

レビュー指摘は `[カテゴリ]` プレフィックスで分類すると可読性が上がる:

| プレフィックス | 用途 |
|---|---|
| `[UI]` | レイアウト・余白・配置の問題 |
| `[UX]` | ユーザビリティ・操作フローの問題 |
| `[A11y]` | アクセシビリティ（コントラスト・タッチターゲット等） |
| `[Typography]` | フォントサイズ・ウェイト・行間の問題 |
| `[Color]` | カラー不整合・トークン未適用 |
| `[Consistency]` | デザインシステムとの不一致 |

## 注意事項

- `findCommentThreads()` は **ページスコープ** — `storage.getFileComments()` でファイル全体を先に把握
- MCP経由でのコメント所有者は **MCP専用ユーザー** (MCP Agent) になる
- `comment:read` / `comment:write` パーミッションは既にプラグインマニフェストで有効
- `addCommentThread` の `position` はキャンバス絶対座標。ボード内を指す場合は `board.x/y` にオフセット加算
- `CommentThread.board` は読取専用 — コメント位置がボード範囲内にあれば自動的に関連付けられる
