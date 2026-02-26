# Pipeline 01: トークン同期

Penpot のデザイントークンと リポジトリの JSON ファイルを双方向同期する。

> **実行境界**: このファイルの execute_code 操作は penpot-mcp サブエージェント内で実行すること。

## Source of Truth

**リポジトリ上のトークン JSON が正本**。Penpot はトークンの作成・編集 UI として使用し、export した JSON をリポジトリにコミットした時点でそれが正本となる。

| ルール | 説明 |
|--------|------|
| Penpot → リポジトリ | Penpot でトークン変更 → export → リポジトリにコミット |
| リポジトリ → Penpot | JSON を手動編集 → Penpot にインポートで同期 |
| 食い違い時 | リポジトリ側を正とする |

**理由**: 変更履歴（コミットログ）、レビュー（MR）、ロールバック、コードとの一体管理、再現性。

## MCP 操作

`activate` 実行後、以下の storage メソッドが使用可能:

```javascript
// エクスポート: Penpot → DTCG JSON（同期）
const json = storage.exportTokensDTCG();
// → Claude Code の Write ツールで tokens/ 配下に保存

// インポート: JSON → Penpot（async、バッチ分割で安定実行）
const jsonString = '...'; // Read ツールで tokens/ 配下のファイルを読み込み
const stats = await storage.importTokensDTCG(jsonString);

// 中断後の再開（WebSocket 切断時など）
const stats = await storage.resumeImport();
```

## リポジトリ構成

```
tokens/
└── core/
    ├── color.json
    ├── spacing.json
    ├── sizing.json
    ├── typography.json
    └── border.json
```

トークン JSON はセットごとにファイル分割し `tokens/core/` 直下にフラット配置する。
フォルダの番号プレフィックス（01-、02- 等）でカスケード順序を制御する場合は、Penpot のセット読み込み順と一致させること。

## DTCG 変換

`exportTokensDTCG()` が型変換・単位付与・`$extensions`（Penpot 元型の保持）を自動処理する。
外部 DTCG JSON（`$extensions` なし）もインポート可能。変換の詳細は `20-token-sync.js` のコメントを参照。

## 既知問題と対処

トークン操作の API 制約（`addSet` 即時読取不可、`token.value` 読み取り専用、バッチ処理等）は [mcp-api.md](../core/mcp-api.md#トークン) を参照。

### インポートの再開手順

`importTokensDTCG()` が途中で失敗した場合:
1. `storage._importProgress` に進捗が自動保存されている
2. サブエージェントが `execute_code` を再呼び出しし `await storage.resumeImport()` で残りを処理
3. 再開時は既存トークンとの重複チェックで冪等性を保証
4. **MCP 再接続は不要**（自動復帰する）
