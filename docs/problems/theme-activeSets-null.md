# theme.activeSets が常に null / selectedTokenSets が永続化されない

## 概要

Penpot 2.x の Plugin API で `theme.activeSets` が常に `null` を返し、
REST API `get-file` の `selectedTokenSets` も常に空オブジェクトとなる。
`theme.addSet()` による関連付けはセッション限定で、サーバーに永続化されない。

これにより `exportTokensDTCG` で `$themes[].sets`（テーマ→セットの関連）を
API から正確に取得する手段がない。

## 実験で判明した Penpot 2.x tokensLib 構造

REST API `get-file` で取得できるファイルデータ:

```
file.data.tokensLib = {
  "Shared": { ...tokens },        // セット名がトップレベルキー
  "Light": { ...tokens },
  "Dark": { ...tokens },
  "$themes": [{
    id, name, group, description, isSource,
    selectedTokenSets: {}          // ← theme.addSet() は永続化されず常に空
  }],
  "$metadata": {
    tokenSetOrder: ["Shared", "Light", "Dark"],
    activeThemes: [],
    activeSets: ["Dark", "Shared"]  // ← switchThemePersistent() で永続化された値
  }
}
```

### 観測結果

| データソース | 取得可能な情報 | テーマ→セット関連 |
|-------------|-------------|-----------------|
| Plugin API `theme.activeSets` | 常に `null` | 取得不可 |
| REST API `$themes[].selectedTokenSets` | 常に空 `{}` | 取得不可 |
| REST API `$metadata.activeSets` | 現在有効なセット名 | テーマとの紐付けなし |
| Plugin API `theme.addSet()` | セッション内のみ有効 | 永続化されない |

## 影響

- `exportTokensDTCG()` の `$themes[].sets` が不正確になる
- テーマのラウンドトリップ（エクスポート→インポート）でテーマ→セット関連が失われる
- REST API でファイル全体を取得しても有用な情報が得られない（無駄なオーバーヘッド）

## 現状の対処

`ensureTheme()` のセッション内キャッシュ (`storage.__themeSetMap`) が唯一の有効データソース。

```javascript
// ensureTheme() 内でキャッシュ
storage.__themeSetMap = storage.__themeSetMap || {};
storage.__themeSetMap[name] = sets.map(s => s.name);
```

`exportTokensDTCG()` はこのキャッシュを参照:
- `__themeSetMap` にデータあり → 正確な `$themes[].sets` を出力
- `__themeSetMap` が空/null → `$themes[].sets` は空配列（正直に空を返す）

### 設計判断

REST API `get-file` からの取得や慣例推論（テーマ名一致 + Shared/Base/Common）は
以下の理由で採用しない:

| 不採用にした手法 | 理由 |
|----------------|------|
| REST API `get-file` → `selectedTokenSets` | ファイル全体を毎回取得するオーバーヘッド。`selectedTokenSets` は常に空で実効ゼロ |
| 慣例推論フォールバック | 不正確な結果を静かに返すリスク。全 MCP ワークフローは `ensureTheme` 経由のため不要 |
| `exportTokensDTCG` の async 化 | 上記の REST API 呼び出しのためだけの破壊的変更 |

## 限界

- **セッション限定**: `__themeSetMap` は WebSocket 切断時（自動再接続後）にリセットされる
- **既存テーマ非対応**: Penpot UI で手動作成したテーマのセット関連は取得できない
- **エクスポート前提**: `ensureTheme` を呼ばずに `exportTokensDTCG` を実行すると `sets` は空配列

## 将来の改善候補

1. **`update-file` による `selectedTokenSets` 永続化**: REST API の `update-file` チェンジタイプで `selectedTokenSets` を直接書き込めれば根本解決の可能性
2. **`$metadata.activeSets` の活用**: テーマとの紐付けはないが、現在有効なセット一覧としてエクスポートに活用できる可能性
3. **Penpot 本体の修正**: `theme.addSet()` の永続化が実装されれば、Plugin API / REST API 両方で自動的に解消

## 対象ファイル

- `.claude/skills/penpot/scripts/mcp-snippets/10-token-utils.js` — `ensureTheme` の `__themeSetMap` キャッシュ
- `.claude/skills/penpot/scripts/mcp-snippets/20-token-sync.js` — `exportTokensDTCG` での `__themeSetMap` 参照

## 日付

2026-02-25
