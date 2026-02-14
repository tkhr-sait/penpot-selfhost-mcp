# 外部パイプライン 概要

Penpot 内部のデザインシステム（Phase 01-08）の出力を受け取り、開発ツールチェーンに接続する下流工程。

## 構成図

```
Penpot（トークン定義・UIデザイン）
   │                          ↑
   │ JSON export (DTCG)       │ JSON import（同期）
   ↓                          │
リポジトリ tokens/（← Source of Truth）
   │
   ↓
Style Dictionary（変換）
   ├── CSS 変数 / SCSS
   ├── Tailwind config
   └── iOS / Android（必要なら）
   │
   ↓
Storybook（コンポーネント開発・カタログ）
   ↓
Lost Pixel（ビジュアルリグレッションテスト）
   ↓
ドキュメントサイト（Astro Starlight）
```

## パイプライン一覧

| Pipeline | ツール | やること | 詳細 |
|----------|--------|----------|------|
| 01 | MCP (token-sync.js) | Penpot ↔ リポジトリのトークン同期 | [01-token-sync.md](01-token-sync.md) |
| 02 | Style Dictionary | JSON → CSS 変数 / SCSS / Tailwind config | [02-style-dictionary.md](02-style-dictionary.md) |
| 03 | Storybook | コンポーネント開発・カタログ | [03-storybook.md](03-storybook.md) |
| 04 | Astro Starlight | デザインシステムドキュメントサイト | [04-docs.md](04-docs.md) |
| 05 | Lost Pixel | ビジュアルリグレッションテスト | [05-vrt.md](05-vrt.md) |

## MCP 統合ポイント

| 操作 | ツール | 説明 |
|------|--------|------|
| トークンエクスポート | `mcp__penpot-official__execute_code` → `storage.exportTokensDTCG()` | Penpot → DTCG JSON |
| トークンインポート | `mcp__penpot-official__execute_code` → `storage.importTokensDTCG(json)` | JSON → Penpot |
| SD 設定生成 | `mcp__penpot-official__execute_code` → `storage.generateStyleDictionaryConfig()` | Style Dictionary 設定テンプレート |
| SD ビルド | Bash → `npx style-dictionary build` | CSS変数/SCSS/Tailwind 生成 |
| コンポーネント一覧 | `mcp__penpot-official__execute_code` → `penpot.library.local.components` | Storybook スキャフォールド用 |

事前に `token-sync.js` を Read → `mcp__penpot-official__execute_code` で初期化すること。

## 最小構成

**Pipeline 01 + 02 + 03**（トークン同期 + Style Dictionary + Storybook）でデザインシステムの基本的な運用が回る。Pipeline 04-05 はチーム規模やプロダクトの成熟度に応じて追加。

## 参考リンク

- [Design Tokens with Penpot](https://penpot.app/blog/design-tokens-with-penpot/) — Penpot 公式トークンチュートリアル
- [Style Dictionary GitHub](https://github.com/amzn/style-dictionary) — Style Dictionary 公式
- [Lost Pixel GitHub](https://github.com/lost-pixel/lost-pixel) — Lost Pixel 公式
- [Astro Starlight](https://starlight.astro.build/) — Starlight ドキュメントテーマ
- [W3C Design Tokens Community Group](https://www.designtokens.org/) — トークン標準仕様
