# コメント操作 API リファレンス

デザイナーが Penpot UI で残したコメントの確認・返信・解決を行う。

## MCP Plugin API

`Page` のコメント関連メソッド:

| メソッド | 説明 |
|----------|------|
| `page.findCommentThreads(criteria?)` | コメントスレッド一覧を取得（`Promise<CommentThread[]>`） |
| `page.addCommentThread(content, position)` | 新規コメントスレッド作成 |
| `page.removeCommentThread(thread)` | コメントスレッド削除 |

`criteria` オブジェクト（任意）:
- `onlyActive: boolean` — アクティブなスレッドのみ
- `showResolved: boolean` — 解決済みも含めるか（`false` で未解決のみ）

`CommentThread` プロパティ・メソッド:

| プロパティ/メソッド | 型 | 説明 |
|---------------------|-----|------|
| `seqNumber` | `number` | スレッド番号（`#1`, `#2`, ...） |
| `resolved` | `boolean` | 解決済みフラグ（書き込み可能） |
| `findComments()` | `Promise<Comment[]>` | スレッド内の全コメント取得 |
| `reply(content)` | `Promise<Comment>` | 返信を追加 |

`Comment` プロパティ:

| プロパティ | 型 | 説明 |
|------------|-----|------|
| `content` | `string` | コメント本文 |
| `user` | `User` | 投稿者情報 |
| `date` | `Date` | 投稿日時 |

## コード例

```javascript
// 未解決コメントスレッドを取得
const threads = await penpot.currentPage.findCommentThreads({
  onlyActive: true,
  showResolved: false
});

// 各スレッドのコメントを確認
for (const thread of threads) {
  const comments = await thread.findComments();
  console.log(`#${thread.seqNumber}: ${comments.map(c => c.content).join(' → ')}`);
}

// 返信する
await threads[0].reply('修正しました。ご確認ください。');

// 解決済みにする
threads[0].resolved = true;
```

## 注意事項

- `findCommentThreads()` は **ページスコープ** — 複数ページにまたがる場合はREST APIで先にファイル全体を把握するのが効率的
- MCP経由でのコメント所有者は **MCP専用ユーザー** (MCP Agent) になる
- `comment:read` / `comment:write` パーミッションは既にプラグインマニフェストで有効
