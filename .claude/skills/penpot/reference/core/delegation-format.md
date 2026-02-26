# サブエージェント委譲: デザイン仕様の構造化フォーマット

親AIがサブエージェント（penpot-mcp）に指示を作成する際の必須フォーマット。該当するセクションのみ記載すること。

## トークン定義（テーマ対応時）

デフォルトを使う場合は `storage.ensureSemanticTokens()` を指示するだけでよい（14色+spacing+borderRadius が自動登録される）。

カスタムが必要な場合のみ、以下の表形式でオーバーライドを指定:

| トークン名 | Light | Dark | 備考 |
|-----------|-------|------|------|
| accent-blue | #007AFF | #64B5F6 | ブランドカラー |

指示例: `storage.ensureSemanticTokens({ overrides: { 'accent-blue': { light: '#007AFF', dark: '#64B5F6' } } })`

## 画面レイアウト（ASCIIワイヤーフレーム）

```
┌──────────────────────────┐
│ NavBar (h:56)            │
├──────────────────────────┤
│ ┌──────┐ ┌──────┐       │
│ │ Card │ │ Card │  ...   │
│ └──────┘ └──────┘       │
├──────────────────────────┤
│ Footer                   │
└──────────────────────────┘
```

各ボードの幅・高さ、Flex の dir/gap/padding を明記すること。

## インタラクション対応表

| トリガー要素 | アクション | ターゲット |
|-------------|-----------|-----------|
| Card クリック | navigate-to | Product Detail |
| Logo クリック | navigate-to | Home |
| 戻るボタン | previous-screen | — |

同一ページ内のボード間のみ有効。OpenOverlay は Plugin API 未実装のため navigate-to で代替。

## テキストコンテンツ一覧

| 画面 | 要素 | テキスト | fontSize / fontWeight |
|------|------|---------|---------------------|
| Home | ヒーロータイトル | New Arrivals | 48 / bold |
| Home | サブタイトル | 最新コレクション | 18 / regular |

タイポグラフィスケールは [design.md](design.md) を参照。
