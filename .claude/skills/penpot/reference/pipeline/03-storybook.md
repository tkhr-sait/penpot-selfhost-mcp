# Pipeline 03: Storybook

コンポーネント開発・カタログ・ドキュメント。

## Docker 連動

| ポート | 用途 |
|--------|------|
| 6006 (Docker) | `storybook-static/` の静的配信 |
| 6007 (ホスト) | dev サーバー (HMR) |

Storybook コンテナは `profiles: [storybook]` で分離。`storybook-static/` が存在する場合のみ `penpot-manage.sh up` で自動起動。

環境変数（`.env` で設定可能）:
```
PENPOT_STORYBOOK_DIR=../../../../../storybook-static
PENPOT_STORYBOOK_PORT=6006
```

```bash
# ビルド → 再起動で Docker コンテナに反映
npm run storybook:build
bash penpot-manage.sh up
```

## 初期化

### 前提

`@storybook/react-vite` は `@vitejs/plugin-react` を**自動注入しない**。
プロジェクトに `vite.config.js` + `react()` プラグインがなければ「React is not defined」エラーが発生する。

### 手順

```bash
# 1. Storybook 初期化（依存関係のインストールはスキップ）
npx storybook@latest init --type react --builder vite --yes --skip-install

# 2. React + Vite プラグインを追加（--skip-install では含まれない）
npm install react react-dom
npm install --save-dev @vitejs/plugin-react

# 3. 全依存関係をインストール
npm install
```

`vite.config.js`（プロジェクトルート）:
```javascript
import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
};
```

### 注意点

- Storybook v10: デフォルトのストーリー配置は `stories/`（`src/stories/` ではない）
- ESM: `package.json` に `"type": "module"` がないと警告が出る
- JSX ファイルに `import React from 'react'` は不要（`react()` プラグインが自動ランタイムを有効化）

## .storybook/ 設定

### main.js

```javascript
const config = {
  stories: [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    {
      name: "@storybook/addon-mcp",
      options: { toolsets: { dev: true, docs: true } },
    },
  ],
  framework: "@storybook/react-vite",
  features: {
    experimentalComponentsManifest: true,
  },
};
```

- `@storybook/addon-mcp` — Storybook MCP サーバー統合アドオン（Claude Code / Copilot と連携）
- `experimentalComponentsManifest: true` — コンポーネントマニフェスト生成を有効化

### preview.js

```javascript
import '../build/css/variables.css';

export default {
  parameters: {
    a11y: { test: "todo" },  // "error" で CI 失敗, "off" でスキップ
  },
};
```

### vitest.setup.js

```javascript
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from '@storybook/react-vite';
import * as projectAnnotations from './preview';

setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);
```

## CSS トークン使用ルール

コンポーネント CSS では `--ds-*` 変数を使用し、ハードコード値を避ける。
命名規則: `--ds-{トークンタイプ}-{名前}`（例: `--ds-color-primary`, `--ds-spacing-md`）。

### 例外（ハードコード許容）

- レイアウト固有の寸法（`width: 375px`, `height: 812px` 等）
- box-shadow（shadow トークン未定義のため）
- z-index
- `0`, `100%`, `auto`, `50%` 等の汎用値
- `rgba()` によるオーバーレイ

### トークン不足時

必要なトークンが `build/css/variables.css` にない場合、`tokens/core/*.json` に追加してから使用する。CSS に直書きしない。

## Penpot コンポーネント構造

Penpot のコンポーネント（メインインスタンス）は典型的に以下の 3 層構造:

```
Board (最上位 — fills/strokes は空)
  └── Group
      ├── Rectangle (背景・ボーダー)
      └── Text (ラベル)
```

- 最上位 Board の `fills`/`strokes` は空 → スタイルは子要素に設定
- CSS 生成は最下層まで再帰的に取得（`penpot.generateStyle` に `withChildren: true`）

## stories/ 構成

`Component.jsx` / `.css` / `.stories.js` のフラット構成:

```
stories/
├── Button.jsx
├── Button.css
├── Button.stories.js
└── ...
```

コンポーネントの `.css` で `--ds-*` CSS 変数を使用:

```css
.button {
  background-color: var(--ds-color-primary);
  color: var(--ds-color-text-on-primary);
  border-radius: var(--ds-border-radius-md);
  padding: var(--ds-spacing-sm) var(--ds-spacing-md);
  font-family: var(--ds-font-family-base);
  font-size: var(--ds-font-size-md);
}
```

## npm スクリプト

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6007",
    "storybook:build": "storybook build",
    "tokens:audit": "! grep -n -E ':\\s*[0-9]+(px|rem|em)' stories/*.css | grep -v -E 'var\\(--ds-' | grep -v -E '(width|height|min-width|min-height|max-width|max-height):\\s*[0-9]' | grep -v 'ds-ignore' | grep .",
    "storybook:deploy": "npm run tokens:build && npm run tokens:audit && npm run storybook:build",
    "vrt:update": "lost-pixel update",
    "vrt": "lost-pixel"
  }
}
```

`storybook:deploy` 後に `penpot-manage.sh up` で Docker コンテナに反映。VRT の詳細は [04-vrt.md](04-vrt.md) を参照。

## 日常ワークフロー: コンポーネント追加

```
1. デザイナー: Penpot で新コンポーネントをデザイン、トークンを適用
2. 開発者: トークン同期（Pipeline 01）→ SD ビルド（Pipeline 02）でCSS変数を最新化
3. 開発者: MCP でコンポーネント情報を取得
4. 開発者: Storybook でコンポーネントを実装（CSS 変数のみ使用、ハードコード禁止）
5. 開発者: `npm run tokens:audit` でハードコード値がないことを確認
6. 開発者: ストーリーを作成・動作確認
```

## 日常ワークフロー: トークン変更

```
1. デザイナー: Penpot でトークン値を変更
2. Pipeline 01 でエクスポート → リポジトリにコミット
3. Pipeline 02 で Style Dictionary ビルド → CSS 変数再生成
4. Storybook をビルド → 変更が反映される
5. npm run vrt → 差分がないことを確認（Pipeline 04 参照）
```
