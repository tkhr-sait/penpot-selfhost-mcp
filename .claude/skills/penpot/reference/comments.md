# コメント操作リファレンス

デザイナーが Penpot UI で残したコメントの確認・返信・解決を行う。

## コード例

`mcp__penpot-official__execute_code` で実行:

```javascript
// 1. ファイル全体の未解決コメントを取得（ページ横断）
const allComments = await storage.getFileComments();
return allComments;
```

結果から該当ページに移動後:

```javascript
// 2. 該当ページのスレッドを取得し、返信・解決
const threads = await penpot.currentPage.findCommentThreads({
  showResolved: false
});
await threads[0].reply('修正しました。');
threads[0].resolved = true;
```

## 注意事項

- `findCommentThreads()` は **ページスコープ** — `storage.getFileComments()` でファイル全体を先に把握
- MCP経由でのコメント所有者は **MCP専用ユーザー** (MCP Agent) になる
- `comment:read` / `comment:write` パーミッションは既にプラグインマニフェストで有効
