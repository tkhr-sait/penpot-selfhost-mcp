# Pipeline 04: ドキュメントサイト（Astro Starlight）

デザインシステムのドキュメントサイト。**Astro Starlight を推奨**。

## 推奨理由

| 項目 | Astro (Starlight) | Docusaurus |
|------|-------------------|------------|
| パフォーマンス | ゼロ JS デフォルト (Islands) | React ランタイム必須 |
| SD 連携 | Tailwind 公式統合 → SD 出力を直接利用 | Infima CSS と競合リスク |
| フレームワーク | Astro のみ、React/Vue/Svelte 全対応 | React 強依存 |
| エアギャップ適性 | 軽量、CDN 不要 | React バンドル必要 |
| ドキュメント特化 | Starlight テーマが充実 | バージョニング・i18n が成熟 |

## セットアップ

```bash
npm create astro@latest -- --template starlight docs-site
cd docs-site
npx astro add tailwind
```

## リポジトリ構成

```
docs-site/
├── astro.config.mjs
├── src/
│   ├── content/docs/
│   │   ├── index.mdx              ← トップページ
│   │   ├── tokens/
│   │   │   ├── color.mdx          ← カラートークン一覧
│   │   │   ├── spacing.mdx        ← スペーシング
│   │   │   └── typography.mdx     ← タイポグラフィ
│   │   └── components/
│   │       ├── button.mdx         ← Button コンポーネント
│   │       └── card.mdx           ← Card コンポーネント
│   └── styles/
│       └── tokens.css             ← Style Dictionary 出力を import
├── tailwind.config.mjs            ← SD の Tailwind 出力を統合
└── package.json
```

## Docker 化（将来対応）

現時点ではローカルビルド + 静的配信を推奨。Docker サービス化は次回対応。

```bash
# ローカルビルド
cd docs-site && npm run build
# → dist/ を任意の静的ファイルサーバーで配信
```
