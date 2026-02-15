# Pipeline 02: Style Dictionary 変換

トークン JSON を各プラットフォーム向けコードに変換する。

## セットアップ

```bash
# プロジェクトルートで
npm install --save-dev style-dictionary@4
```

## DTCG 入力要件

Style Dictionary v4 は W3C DTCG 形式（`$value`, `$type`）をネイティブサポートする。

| 要件 | 説明 |
|------|------|
| `dimension` タイプは単位必須 | `"13px"` ○ / `"13"` × — 単位なしだと SD がエラー |
| `fontFamily` は CSS 互換文字列 | `"Source Sans Pro, sans-serif"` |
| `fontWeight` は数値文字列 | `"400"` でOK |
| `color` は CSS カラー値 | `"#2563eb"` 等 |

`token-sync.js` の `exportTokensDTCG()` は dimension 系に `px` を自動付与するため、エクスポートした JSON はそのまま SD に入力可能。

## 設定テンプレート

`storage.generateStyleDictionaryConfig()` で生成できる:

```javascript
// MCP で設定テンプレートを生成
const config = storage.generateStyleDictionaryConfig({
  tokensDir: 'tokens',    // トークン JSON のディレクトリ
  buildDir: 'build/',     // 出力先
  prefix: 'ds'            // CSS 変数のプレフィックス（例: --ds-color-primary）
});
// → Write ツールで style-dictionary.config.js に保存
```

### CSS のみの最小構成

scss / tailwind が不要な場合の最小設定:

```javascript
// style-dictionary.config.js
import StyleDictionary from 'style-dictionary';

export default {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'ds',
      buildPath: 'build/css/',
      files: [{
        destination: 'variables.css',
        format: 'css/variables',
        options: { outputReferences: true }
      }]
    }
  }
};
```

### フル構成（CSS + SCSS + Tailwind）

```javascript
// style-dictionary.config.js
import StyleDictionary from 'style-dictionary';

export default {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'ds',
      buildPath: 'build/css/',
      files: [{
        destination: 'variables.css',
        format: 'css/variables',
        options: { outputReferences: true }
      }]
    },
    scss: {
      transformGroup: 'scss',
      prefix: 'ds',
      buildPath: 'build/scss/',
      files: [{
        destination: '_tokens.scss',
        format: 'scss/variables',
        options: { outputReferences: true }
      }]
    },
    tailwind: {
      transformGroup: 'js',
      buildPath: 'build/tailwind/',
      files: [{
        destination: 'tokens.js',
        format: 'javascript/es6'
      }]
    }
  }
};
```

## ビルド

```bash
# 直接実行
npx style-dictionary build --config style-dictionary.config.js

# npm スクリプト経由（推奨）
npm run tokens:build
```

`package.json` に追加:
```json
{
  "scripts": {
    "tokens:build": "style-dictionary build --config style-dictionary.config.js"
  }
}
```

## 出力

```
build/
└── css/
    └── variables.css      ← CSS カスタムプロパティ (--ds-*)
```

フル構成の場合:
```
build/
├── css/variables.css      ← CSS カスタムプロパティ
├── scss/_tokens.scss      ← SCSS 変数
└── tailwind/tokens.js     ← Tailwind 用 JS
```

## 日常ワークフロー

```
1. Penpot でトークン変更
2. Pipeline 01 でエクスポート → tokens/ にコミット
3. npm run tokens:build → build/ に出力
4. build/ もコミット（または CI で自動ビルド）
```
