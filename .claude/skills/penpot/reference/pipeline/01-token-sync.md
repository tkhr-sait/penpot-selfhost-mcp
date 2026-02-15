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

## DTCG 変換ルール

`exportTokensDTCG()` が自動処理する変換:

| Penpot トークン型 | DTCG $type | 値の変換 |
|---|---|---|
| `dimension`, `spacing`, `sizing`, `borderRadius`, `borderWidth`, `fontSizes`, `letterSpacing` | `dimension` | 単位なし数値に `px` を自動付与（`"13"` → `"13px"`） |
| `fontFamilies` | `fontFamily` | CSS 互換文字列に変換（`"Source Sans Pro, sans-serif"` 等） |
| `opacity`, `fontWeights`, `number`, `rotation` | `number` / `fontWeight` | 単位なし数値のまま |
| `color` | `color` | そのまま |
| `textCase`, `textDecoration` | `string` | そのまま |

### $extensions による Penpot 型の保持

W3C DTCG 仕様では複数の Penpot トークン型が同じ DTCG `$type` にマッピングされるため、ラウンドトリップ（export → import）で元の型が失われる:
- `spacing`, `sizing`, `borderRadius`, `borderWidth`, `fontSizes`, `letterSpacing` → `dimension`
- `opacity`, `rotation` → `number`
- `textCase`, `textDecoration` → `string`

`exportTokensDTCG()` は DTCG `$type` から Penpot 元型を復元できないトークンに `$extensions` フィールドを付与:

```json
{
  "$value": "16px",
  "$type": "dimension",
  "$extensions": { "com.penpot": { "type": "spacing" } }
}
```

`importTokensDTCG()` は以下の優先順でタイプを解決:
1. `$extensions['com.penpot'].type` （Penpot エクスポート由来）
2. `_reverseTypeMap[dtcgType]` （外部 DTCG ファイル）
3. DTCG `$type` そのまま
4. フォールバック: `'dimension'`

外部 DTCG JSON（`$extensions` なし）も従来通りインポート可能。

## 既知問題と対処

### fontFamilies の ClojureScript PersistentVector 問題

Penpot 内部で `fontFamilies` トークンの `value` が ClojureScript の PersistentVector（`$tail$` 等のキーを持つオブジェクト）として返されることがある。

**対処**: `token-sync.js` の `exportTokensDTCG()` で自動変換済み:
1. `fontNameMap` のマッピングテーブルで CSS 名に変換
2. `token.resolvedValue` を試行
3. PersistentVector の `$tail$` 配列から文字列を抽出
4. フォールバック: `token.value` をそのまま出力

### `addSet()` 戻り値のプロパティ即時読取不可

`catalog.addSet(name)` の戻り値は、プロパティ（`name`, `active` 等）を即時読み取れない場合がある。

**対処**: `catalog.sets.find(s => s.name === setName)` で再取得する。

### 大量トークン作成時の WebSocket 切断

トークンを一括作成すると Plugin API の操作が UI 更新をトリガーし、WebSocket が切断されることがある。

**対処**:
- `importTokensDTCG()` は 10 件ごとのバッチに分割し、各バッチ間に 200ms の sleep を挿入
- 個別の `addToken` / トークン更新後にも 50ms の sleep を挿入（10件一気発火を防止）
  - `token.value` は読み取り専用（getter のみ）のため、値更新は `token.remove()` + `set.addToken()` で行う
- `addSet` / `toggleActive` 後にも 100ms の sleep を挿入
- セットごとの既存トークンマップを事前構築し、ループ内 O(n²) 再構築を回避
- 切断が発生した場合は `storage.resumeImport()` で途中から再開可能。**MCP 再接続は不要**（自動復帰する）

### `resumeImport` のロジック統合

`importTokensDTCG` と `resumeImport` は内部関数 `_prepareSets` / `_processTokenBatches` を共有。修正が1箇所で済み、ロジック不整合を防止。

### インポートの再開手順

1. `importTokensDTCG()` が途中で失敗
2. `storage._importProgress` に進捗が保存されている
3. `execute_code` を再呼び出しし `await storage.resumeImport()` で残りを処理
4. 再開時は既存トークンとの重複チェックで冪等性を保証
