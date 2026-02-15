# Pipeline 03: Storybook

コンポーネント開発・カタログ・ドキュメント。

## Docker 連動

### コンテナ構成

`penpotapp/storybook` イメージは Nginx で `/var/www` を静的配信する。
`storybook-static/` を `/var/www:ro` にボリュームマウントして利用する。

| サービス | ポート | 用途 |
|----------|--------|------|
| penpot-storybook | 6006 (Docker) | 静的ビルドの配信 |
| dev サーバー | 6007 (ホスト) | 開発時の HMR サーバー |

> 6006 は Docker コンテナが使用するため、dev サーバーは 6007 に変更する。

### profile 制御

Storybook コンテナは `profiles: [storybook]` で分離されている。
`storybook-static/` ディレクトリが存在する場合のみ `penpot-manage.sh up` が `--profile storybook` を付与して起動する。

```bash
# storybook-static/ がない場合 → Storybook コンテナはスキップ
bash penpot-manage.sh up
# → "Info: storybook-static/ が見つかりません。Storybook コンテナはスキップ。"

# ビルド後に再起動 → Storybook コンテナが起動
npm run storybook:build
bash penpot-manage.sh up
# → "Storybook: 配信します"
```

### 環境変数

`PENPOT_STORYBOOK_DIR` でマウント元ディレクトリを制御可能（`.env` で設定）:
```
PENPOT_STORYBOOK_DIR=../../../../../storybook-static
PENPOT_STORYBOOK_PORT=6006
```

## 初期化

```bash
# 非対話的に初期化（React + Vite）
npx storybook@latest init --type react --builder vite --yes --skip-install
npm install
```

注意点:
- Storybook v10: デフォルトのストーリー配置は `stories/`（`src/stories/` ではない）
- ESM: `package.json` に `"type": "module"` がないと警告が出る

## Penpot コンポーネント構造

Penpot のコンポーネント（メインインスタンス）は典型的に以下の 3 層構造:

```
Board (最上位 — fills/strokes は空)
  └── Group
      ├── Rectangle (背景・ボーダー)
      └── Text (ラベル)
```

- 最上位 Board の `fills`/`strokes` は空 → スタイルは子要素（Group 内の Rectangle/Text）に設定
- CSS 生成は最下層まで再帰的に取得する必要がある（`penpot.generateStyle` に `withChildren: true` を指定）

### コンポーネント一覧取得

```javascript
// MCP で Penpot コンポーネント一覧を取得
const components = penpot.library.local.components;
return components.map(c => ({
  name: c.name,
  path: c.path
}));
```

## stories/ 構成

`Component.jsx` / `.css` / `.stories.js` のフラット構成:

```
stories/
├── Button.jsx
├── Button.css
├── Button.stories.js
├── Input.jsx
├── Input.css
├── Input.stories.js
├── Checkbox.jsx
├── Checkbox.css
├── Checkbox.stories.js
└── ...
```

### CSS 変数の使用パターン

コンポーネントの `.css` ファイルで `--ds-*` CSS 変数を使用:

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

CSS 変数は `.storybook/preview.js` で `build/css/variables.css` をインポートして読み込む:

```javascript
// .storybook/preview.js
import '../build/css/variables.css';

export default {
  // ...
};
```

## npm スクリプト

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| `storybook` | `storybook dev -p 6007` | dev サーバー (HMR) |
| `storybook:build` | `storybook build` | 静的ビルド → `storybook-static/` |
| `storybook:deploy` | `npm run tokens:build && npm run storybook:build` | 一括: トークンビルド → Storybook ビルド |

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6007",
    "storybook:build": "storybook build",
    "storybook:deploy": "npm run tokens:build && npm run storybook:build"
  }
}
```

`storybook:deploy` 後に `penpot-manage.sh up` で Docker コンテナに反映。

## 日常ワークフロー: コンポーネント追加

```
1. デザイナー: Penpot で新コンポーネントをデザイン、トークンを適用
2. 開発者: MCP でコンポーネント情報を取得
3. 開発者: Storybook でコンポーネントを実装（トークン生成 CSS 変数を使用）
4. 開発者: ストーリーを作成・動作確認
```

## 日常ワークフロー: トークン変更

```
1. デザイナー: Penpot でトークン値を変更
2. Pipeline 01 でエクスポート → リポジトリにコミット
3. Pipeline 02 で Style Dictionary ビルド → CSS 変数再生成
4. Storybook をビルド → 変更が反映される
```
