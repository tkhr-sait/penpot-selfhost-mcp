# Pipeline 02: Style Dictionary 変換

トークン JSON を各プラットフォーム向けコードに変換する。

## セットアップ

```bash
# プロジェクトルートで
npm install --save-dev style-dictionary@4
```

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

生成される設定ファイル例:

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
npx style-dictionary build --config style-dictionary.config.js
```

## 出力

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
3. npx style-dictionary build → build/ に出力
4. build/ もコミット（または CI で自動ビルド）
```
