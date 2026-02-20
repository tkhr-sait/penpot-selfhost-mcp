# Pipeline 04: ビジュアルリグレッション（VRT）

Lost Pixel によるコンポーネントのスクリーンショット比較。

## 概要

- Storybook のストーリーからスクリーンショットを自動撮影
- ベースラインとのピクセル比較で差分検出
- トークン変更の影響範囲を視覚的に確認

## セットアップ

### インストール

```bash
npm install --save-dev lost-pixel
```

### Playwright Chromium のインストール

Lost Pixel は内部に `playwright-core` を独自バンドルしている（プロジェクトの Playwright とは別バージョン）。Lost Pixel 用の Chromium を別途インストールする必要がある:

```bash
node ./node_modules/lost-pixel/node_modules/playwright-core/cli.js install chromium
```

> `npx playwright install chromium` ではプロジェクト側の Playwright バージョンがインストールされ、Lost Pixel が要求するバージョンと一致しない場合がある。必ず Lost Pixel バンドルの `playwright-core` を使うこと。

### 設定ファイル

`lostpixel.config.js`（プロジェクトルート）:

```javascript
export const config = {
  storybookShots: {
    storybookUrl: './storybook-static',
  },
  generateOnly: true,
  failOnDifference: true,
};
```

| オプション | 値 | 説明 |
|-----------|-----|------|
| `storybookUrl` | `'./storybook-static'` | ビルド済み静的 Storybook のパス |
| `generateOnly` | `true` | Lost Pixel Platform（クラウド）不使用、ローカル比較のみ |
| `failOnDifference` | `true` | 差分検出時に exit 1（CI 統合対応） |

## ディレクトリ構成

```
.lostpixel/
├── baseline/    ← ベースライン画像（コミット対象）
├── current/     ← 現在のスクリーンショット（.gitignore 対象）
└── difference/  ← 差分画像（.gitignore 対象）
```

### .gitignore

```
# Lost Pixel
.lostpixel/current/
.lostpixel/difference/
```

`baseline/` はコミット対象（差分比較の基準となるため）。

## npm スクリプト

```json
{
  "vrt:update": "lost-pixel update",
  "vrt": "lost-pixel"
}
```

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| `vrt:update` | `lost-pixel update` | ベースラインスクリーンショット生成/更新 |
| `vrt` | `lost-pixel` | ベースラインと比較（差分あれば exit 1） |

## 前提条件

1. `npm run storybook:build` 完了済み（`storybook-static/` が存在すること）
2. Lost Pixel 用 Playwright Chromium インストール済み

## ワークフロー

### 初回セットアップ

```
1. npm install --save-dev lost-pixel
2. lostpixel.config.js 作成
3. Lost Pixel 用 Chromium インストール
4. npm run storybook:build
5. npm run vrt:update → .lostpixel/baseline/ に PNG 生成
6. baseline/ をコミット
```

### 日常ワークフロー: トークン変更時

```
1. デザイナー: Penpot でトークン値を変更
2. Pipeline 01 でエクスポート → リポジトリにコミット
3. Pipeline 02 で Style Dictionary ビルド → CSS 変数再生成
4. npm run storybook:build → 変更を静的ビルドに反映
5. npm run vrt → ベースラインと比較
   - 差分なし → 変更はビジュアルに影響なし（正常）
   - 差分あり → .lostpixel/difference/ で確認
```

### ベースライン更新の判断基準

| ケース | 対応 |
|--------|------|
| 意図的なデザイン変更 | `npm run vrt:update` → baseline/ をコミット |
| リグレッション（意図しない変化） | コンポーネント/トークンを修正して `npm run vrt` で再検証 |
