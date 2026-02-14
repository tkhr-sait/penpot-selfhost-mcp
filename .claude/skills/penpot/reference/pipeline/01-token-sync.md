# Pipeline 01: トークン同期

Penpot のデザイントークンと リポジトリの JSON ファイルを双方向同期する。

## Source of Truth

**リポジトリ上のトークン JSON が正本**。Penpot はトークンの作成・編集 UI として使用し、export した JSON をリポジトリにコミットした時点でそれが正本となる。

| ルール | 説明 |
|--------|------|
| Penpot → リポジトリ | Penpot でトークン変更 → export → リポジトリにコミット |
| リポジトリ → Penpot | JSON を手動編集 → Penpot にインポートで同期 |
| 食い違い時 | リポジトリ側を正とする |

**理由**: 変更履歴（コミットログ）、レビュー（MR）、ロールバック、コードとの一体管理、再現性。

## MCP 操作

事前に `token-sync.js` を Read → `mcp__penpot-official__execute_code` で初期化:

```javascript
// エクスポート: Penpot → DTCG JSON
const json = storage.exportTokensDTCG();
// → Claude Code の Write ツールで tokens/ 配下に保存

// インポート: JSON → Penpot
const jsonString = '...'; // Read ツールで tokens/ 配下のファイルを読み込み
storage.importTokensDTCG(jsonString);
```

## リポジトリ構成

```
tokens/
├── core/
│   └── 01-base/
│       ├── color.json
│       ├── spacing.json
│       └── typography.json
└── semantic/
    ├── 01-base/
    │   └── color.json
    ├── 02-light/
    │   └── color.json
    └── 03-dark/
        └── color.json
```

フォルダの番号プレフィックス（01-、02- 等）は Penpot のカスケード順序を制御するために重要。後から読み込まれたセットが同名トークンを上書きする。
