# Recipe: ライブラリファイル作成・接続

Shared Library を新規作成し、作業中のファイルに接続する。
API 制約 → [mcp-api.md #ライブラリ管理](../core/mcp-api.md#ライブラリ管理)

`activate` 実行後:

## コード例

```javascript
const projectId = await storage.getCurrentProjectId();

// Shared Library として作成
const libFile = await storage.createFile(projectId, 'UI Components Lib', { isShared: true });

// 作業中ファイルにライブラリを接続
const originalFileId = penpot.currentFile.id;
await storage.linkLibrary(originalFileId, libFile.id);

return { libFileId: libFile.id, linked: true };
```

## 注意点

- REST API ユーティリティは activate 時に自動初期化される
- ライブラリにコンポーネントを登録するには `storage.openFile()` でファイル切替が必要 → [mcp-api.md #ファイル切替](../core/mcp-api.md#ファイル切替)
- `get-file-libraries` は推移的依存も返す（重複表示されるが実害なし）
