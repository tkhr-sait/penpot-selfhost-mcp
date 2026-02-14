# Phase 05: ライブラリ構成・共有

## 目的
デザインシステムを分割ライブラリとして構成し、チーム全体で共有・同期する。

詳細なライブラリ構成は [library-architecture.md](../library-architecture.md) を参照。

## Penpotでの操作

### 分割ライブラリの作成
- ブランド / カラー / タイポグラフィ / UIパターンを別ファイル（=別ライブラリ）に分離
- プロジェクトに応じて必要なライブラリだけを接続

### Connected Libraries の設定
1. ライブラリ間の依存関係を設定
2. 接続例: カラートークンLib → ブランドLib → UIコンポーネントLib
3. 更新通知で自動同期

### Shared Libraries で公開
1. ローカルライブラリを Shared Library として公開
2. チーム全体のプロジェクトからアクセス可能
3. 接続先からはアセット編集不可（読み取り専用）

## MCP によるライブラリ操作

### ローカルライブラリの管理
`penpot.library.local` でコンポーネントを管理。カラー・タイポグラフィはネイティブデザイントークンで管理（Phase 03 参照）。

### 外部ライブラリの接続

```javascript
const available = await penpot.library.availableLibraries();
const lib = await penpot.library.connectLibrary(id);
```

### 接続ライブラリのアセット利用
`lib.components` から取得し、`instance()` で適用。

## REST API によるライブラリ管理

`penpot-rest-api.js` を初期化すれば、ファイル作成・共有設定・ライブラリ接続が MCP で完結する。

1. **ライブラリファイル作成**: `await storage.createFile(projectId, 'UI Components Lib', { isShared: true })`
2. **ライブラリ接続**: `await storage.linkLibrary(originalFileId, libFileId)`

### openFile 方式（コンポーネント登録等、Plugin API が必要な場合）

1. **ファイル切替**: `await storage.openFile(projectId, newFileId)` — MCP 再接続が発生（10-15秒）
2. **再接続**: `/mcp` → `penpot-official` → Reconnect → `penpot-init.js` + `penpot-rest-api.js` を再初期化
3. **アセット登録**: Plugin API でコンポーネント等を登録
4. **元ファイルに戻る**: `await storage.openFile(projectId, originalFileId)` → 再接続 → 再初期化
5. **ライブラリ接続**: `await storage.linkLibrary(originalFileId, libFileId)`

## 成果物
- 分割ライブラリ構成
- ライブラリ依存関係マップ
- 公開済み Shared Libraries
