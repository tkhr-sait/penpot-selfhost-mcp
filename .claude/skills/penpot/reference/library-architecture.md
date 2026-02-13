# ライブラリ構成アーキテクチャ

Penpotのデザインシステムを構成するライブラリの分割戦略と依存関係。

## 基本原則

- 用途ごとにライブラリを分割し、必要なものだけプロジェクトに接続する
- 小さいファイルは管理しやすく、パフォーマンスも良い
- Connected Libraries の接続数に上限はない
- Shared Library として公開したアセットは接続先から編集不可（誤変更防止）

## 推奨ライブラリ構成

```
Design System/
├── Icons Lib
│   ├── ナビゲーション系
│   ├── アクション系
│   └── ステータス / フィードバック系
│
├── UI Components Lib
│   ├── ボタン / フォーム要素
│   ├── カード / モーダル
│   └── ナビゲーション / ヘッダー
│
└── Layout Patterns Lib
    ├── Grid テンプレート
    ├── Flex レイアウトルール
    └── レスポンシブブレークポイント
```

※ カラー・タイポグラフィ等はネイティブ Design Tokens で管理。ライブラリファイルは不要。

## ライブラリ間の依存関係

```
Icons Lib ──→ UI Components Lib ──→ Layout Patterns Lib
```

接続ルール:
- カラー・タイポグラフィはネイティブ Design Tokens で各ファイルに直接定義（ライブラリ接続不要）
- UI Components Lib は Icons に依存
- Layout Patterns Lib は UI Components を含むテンプレート
- `get-file-libraries` API は推移的依存も返すため、作業ファイルの一覧で同じライブラリが重複表示されることがあるが実害なし

## 分割の判断基準

チームの規模や要件に応じて柔軟に分割する。以下は判断の指針:

| 基準 | 分割する | まとめる |
|------|---------|---------|
| 更新頻度 | カラーは滅多に変えない → 分離 | 頻繁に一緒に更新 → 同一Lib |
| 利用範囲 | アイコンは一部プロジェクトのみ → 分離 | 全プロジェクトで必須 → 基盤Lib |
| チーム境界 | ブランドチーム管理 → 分離 | 同一チームが管理 → まとめてもOK |
| ファイルサイズ | コンポーネント数百個 → 分割 | 数十個程度 → まとめてOK |

## プロジェクトへの接続例

```
Landing Page プロジェクト
  ├── Design Tokens (ネイティブ)
  ├── 接続: UI Components Lib ✓
  └── 接続: Icons Lib ✗ (不要)

管理画面プロジェクト
  ├── Design Tokens (ネイティブ)
  ├── 接続: UI Components Lib ✓
  ├── 接続: Icons Lib ✓
  └── 接続: Layout Patterns Lib ✓
```

プロジェクトに必要なライブラリだけを接続することで、不要なアセットが混在せず、開発者がコードへの依存関係を把握しやすくなる。

## MCP でのライブラリ操作

MCP (`execute_code`) を使えば、ライブラリのアセット登録・取得をプログラム的に行える。

### コンポーネント登録

```javascript
const comp = penpot.library.local.createComponent(shapes);
comp.name = 'Button / Primary / Large';
```

### 接続ライブラリの利用

```javascript
const available = await penpot.library.availableLibraries();
const lib = await penpot.library.connectLibrary(libraryId);
const components = lib.components;  // 外部ライブラリのコンポーネント取得
```

### 既存ライブラリアセットの確認

```javascript
// 登録済みコンポーネント一覧
const components = penpot.library.local.components;
```

### REST API によるライブラリ管理

`penpot-rest-api.js` を初期化すれば、ファイル作成・共有設定・ライブラリ接続が MCP で完結する。

#### ワークフロー

```
1. REST API でライブラリファイルを作成 + 共有設定
   storage.createFile(projectId, 'UI Components Lib', { isShared: true })

2. openFile でライブラリファイルに切り替え → Plugin API でコンポーネント登録

3. ライブラリ接続
   storage.linkLibrary(currentFileId, libFile.id)
```

#### コード例

```javascript
// 1. ライブラリファイル作成 + 共有化
const libFile = await storage.createFile(projectId, 'UI Components Lib', { isShared: true });

// 2. openFile でライブラリファイルに切り替え（MCP 再接続が発生）
await storage.openFile(projectId, libFile.id);
// → 再接続後、penpot-init.js + penpot-rest-api.js を再初期化
// → Plugin API でコンポーネント登録

// 3. 元ファイルにライブラリ接続
await storage.linkLibrary(currentFileId, libFile.id);

// 4. 接続済みライブラリ確認
const linked = await storage.getFileLibraries(currentFileId);
```
