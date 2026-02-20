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
   ├── CSS 変数 (build/css/variables.css)
   ├── SCSS（必要なら）
   └── Tailwind config（必要なら）
   │
   ↓
Storybook（コンポーネント開発・カタログ）
   ↓
Lost Pixel（ビジュアルリグレッションテスト）
```

## 実ディレクトリ構成

```
(project root)
├── tokens/                          ← Penpot エクスポート先（DTCG JSON）
│   └── core/
│       ├── color.json
│       ├── spacing.json
│       ├── sizing.json
│       ├── typography.json
│       └── border.json
├── build/                           ← Style Dictionary 出力
│   └── css/
│       └── variables.css            ← CSS カスタムプロパティ (--ds-*)
├── stories/                         ← Storybook ストーリー
│   ├── Button.jsx / .css / .stories.js
│   ├── Input.jsx / .css / .stories.js
│   └── ...
├── .storybook/
│   ├── main.js
│   ├── preview.js                   ← import '../build/css/variables.css'
│   └── vitest.setup.js              ← a11y アドオンの setProjectAnnotations
├── .lostpixel/
│   └── baseline/                    ← ベースライン画像（コミット対象）
├── storybook-static/                ← Storybook ビルド出力 → Docker マウント
├── style-dictionary.config.js
├── package.json
└── vitest.config.js
```

`.storybook/preview.js` で `build/css/variables.css` をインポートすることで、Storybook 内のコンポーネントがトークン由来の CSS 変数を利用できる。

## npm スクリプト一覧

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| `tokens:build` | `style-dictionary build --config style-dictionary.config.js` | トークン → CSS 変数 |
| `tokens:audit` | `! grep ... \| grep -v 'ds-ignore' \| grep .` | CSS ハードコード値検出（失敗で exit 1） |
| `storybook` | `storybook dev -p 6007` | Storybook dev サーバー |
| `storybook:build` | `storybook build` | Storybook 静的ビルド |
| `storybook:deploy` | `npm run tokens:build && npm run tokens:audit && npm run storybook:build` | 一括ビルド（監査含む） |
| `vrt` | `lost-pixel` | VRT: ベースラインと比較（差分で exit 1） |
| `vrt:update` | `lost-pixel update` | VRT: ベースライン更新 |

## パイプライン一覧

| Pipeline | ツール | やること | 詳細 |
|----------|--------|----------|------|
| 01 | MCP (token-sync.js) | Penpot ↔ リポジトリのトークン同期 | [01-token-sync.md](01-token-sync.md) |
| 02 | Style Dictionary | JSON → CSS 変数 / SCSS / Tailwind config | [02-style-dictionary.md](02-style-dictionary.md) |
| 03 | Storybook | コンポーネント開発・カタログ | [03-storybook.md](03-storybook.md) |
| 04 | Lost Pixel | ビジュアルリグレッションテスト | [04-vrt.md](04-vrt.md) |

## MCP 統合ポイント

| 操作 | ツール | 説明 |
|------|--------|------|
| トークンエクスポート | `mcp__penpot-official__execute_code` → `storage.exportTokensDTCG()` | Penpot → DTCG JSON |
| トークンインポート | `mcp__penpot-official__execute_code` → `await storage.importTokensDTCG(json)` | JSON → Penpot（バッチ処理） |
| インポート再開 | `mcp__penpot-official__execute_code` → `await storage.resumeImport()` | 中断からの再開 |
| SD 設定生成 | `mcp__penpot-official__execute_code` → `storage.generateStyleDictionaryConfig()` | Style Dictionary 設定テンプレート |
| SD ビルド | Bash → `npm run tokens:build` | CSS変数/SCSS/Tailwind 生成 |
| コンポーネント一覧 | `mcp__penpot-official__execute_code` → `penpot.library.local.components` | Storybook スキャフォールド用 |

事前に `token-sync.js` を Read → `mcp__penpot-official__execute_code` で初期化すること。

## 最小構成

**Pipeline 01 + 02 + 03**（トークン同期 + Style Dictionary + Storybook）でデザインシステムの基本的な運用が回る。

Pipeline 04（Lost Pixel VRT）はトークン変更の視覚的影響を検証する品質ゲートとして推奨。ローカル環境で完結し、外部サービス不要（`generateOnly: true`）。

## 参考リンク

- [Design Tokens with Penpot](https://penpot.app/blog/design-tokens-with-penpot/) — Penpot 公式トークンチュートリアル
- [Style Dictionary GitHub](https://github.com/amzn/style-dictionary) — Style Dictionary 公式
- [Lost Pixel GitHub](https://github.com/lost-pixel/lost-pixel) — Lost Pixel 公式
- [W3C Design Tokens Community Group](https://www.designtokens.org/) — トークン標準仕様
