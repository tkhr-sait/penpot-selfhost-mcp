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
├── Colors Lib
│   ├── Primary / Secondary
│   ├── Semantic (success, error, warning, info)
│   └── Neutral / Grayscale
│
├── Typography Lib
│   ├── 見出し (H1〜H6)
│   ├── 本文 / キャプション
│   └── フォントファミリー定義
│
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

## ライブラリ間の依存関係

```
Colors Lib ──→ Typography Lib
    │               │
    └───────┬───────┘
            ↓
      Icons Lib ──→ UI Components Lib ──→ Layout Patterns Lib
```

接続ルール:
- Colors Lib は他のすべてのLibから参照される基盤
- Typography Lib は Colors Lib に依存
- UI Components Lib は Colors, Typography, Icons に依存
- Layout Patterns Lib は UI Components を含むテンプレート
- **重要**: コンポーネントライブラリは必ずトークンライブラリ（Colors / Typography）を `linkLibrary` で接続すること。未接続だとトークン更新がコンポーネントに反映されない
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
  ├── 接続: Colors Lib ✓
  ├── 接続: Typography Lib ✓
  ├── 接続: UI Components Lib ✓
  └── 接続: Icons Lib ✗ (不要)

管理画面プロジェクト
  ├── 接続: Colors Lib ✓
  ├── 接続: Typography Lib ✓
  ├── 接続: UI Components Lib ✓
  ├── 接続: Icons Lib ✓
  └── 接続: Layout Patterns Lib ✓
```

プロジェクトに必要なライブラリだけを接続することで、不要なアセットが混在せず、開発者がコードへの依存関係を把握しやすくなる。

## MCP でのライブラリ操作

MCP (`execute_code`) を使えば、ライブラリのアセット登録・取得をプログラム的に行える。

### カラー登録

```javascript
const color = penpot.library.local.createColor();
color.name = 'Design system / Colors / Primary / Blue 500';
color.color = '#3B82F6';
```

### タイポグラフィ登録

```javascript
const typo = penpot.library.local.createTypography();
typo.name = 'Design system / Typography / H1';
typo.fontFamily = 'sourcesanspro';
typo.fontSize = '32';
typo.fontWeight = 'bold';
```

### コンポーネント登録

```javascript
const comp = penpot.library.local.createComponent(shapes);
comp.name = 'Button / Primary / Large';
```

### 接続ライブラリの利用

```javascript
const available = await penpot.library.availableLibraries();
const lib = await penpot.library.connectLibrary(libraryId);
const colors = lib.colors;  // 外部ライブラリのカラー取得
```

### 既存ライブラリアセットの確認

```javascript
// 登録済みカラー一覧
const colors = penpot.library.local.colors;

// 登録済みタイポグラフィ一覧
const typographies = penpot.library.local.typographies;

// 登録済みコンポーネント一覧
const components = penpot.library.local.components;
```

### REST API によるライブラリ分割・接続

`penpot-rest-api.js` を初期化すれば、ファイル作成からアセット登録・ライブラリ接続まで MCP で完結する。

#### ワークフロー（推奨: REST API 方式 — Plugin API・MCP 切断不要）

```
1. REST API でライブラリファイルを作成 + 共有設定
   storage.createFile(projectId, 'Colors Lib', { isShared: true })

2. execInFile で REST API 経由のアセット登録（update-file + add-color/add-typography チェンジ）
   storage.execInFile(projectId, libFile.id, [
     { type: 'createColor', name: '...', color: '#...' },
     { type: 'createTypography', name: '...', fontFamily: 'sourcesanspro', fontSize: 32 },
   ])

3. ライブラリ接続
   storage.linkLibrary(currentFileId, libFile.id)
```

旧方式（openFile）との比較:
- 旧: openFile → 再接続 → 再初期化 → Plugin API → openFile で戻る → 再接続 → 再初期化（計2回の再接続・再初期化）
- 新: execInFile (REST API) 1回で完結（Plugin API 不要、MCP 切断・再接続不要）

#### コード例

```javascript
// 1. ライブラリファイル作成 + 共有化
const libFile = await storage.createFile(projectId, 'Colors Lib', { isShared: true });

// 2. カラー登録（REST API 経由、MCP 切断なし）
await storage.registerColorsInFile(projectId, libFile.id, [
  { name: 'Design system / Colors / Primary / Blue 500', color: '#3B82F6' },
  { name: 'Design system / Colors / Primary / Blue 700', color: '#1D4ED8' },
]);

// 3. タイポグラフィ登録（REST API 経由、MCP 切断なし）
await storage.registerTypographiesInFile(projectId, libFile.id, [
  { name: 'Design system / Typography / H1', fontFamily: 'sourcesanspro', fontSize: 32, fontWeight: 'bold' },
]);

// 4. 元ファイルにライブラリ接続
await storage.linkLibrary(currentFileId, libFile.id);

// 5. 接続済みライブラリ確認
const linked = await storage.getFileLibraries(currentFileId);
```

#### 技術詳細

`execInFile` は内部で以下を行う:
1. `get-file` API でファイル情報取得（`revn` + 既存アセット確認）
2. operations を Penpot `update-file` の changes に変換（`add-color` / `add-typography`）
3. `update-file` API でチェンジを一括送信

name のスラッシュ区切り（例: `'Design system / Colors / Primary / Blue 500'`）は自動的に `path` と `name` に分離される（Penpot 内部は分離管理）。

> **注意**: `execInFile` は REST API (`update-file`) を使用するため、Plugin API や MCP 接続は一切不要。カラー・タイポグラフィの登録に最適。コンポーネント登録など複雑な操作には Plugin API（`openFile` 方式）が必要。
