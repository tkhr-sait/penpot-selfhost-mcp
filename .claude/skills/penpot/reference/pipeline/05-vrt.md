# Pipeline 05: ビジュアルリグレッション（将来対応）

Lost Pixel によるコンポーネントのスクリーンショット比較。

## 概要

- Storybook のストーリーからスクリーンショットを自動撮影
- ベースラインとのピクセル比較で差分検出
- トークン変更の影響範囲を視覚的に確認

## セットアップ（概要）

```bash
npm install --save-dev lost-pixel
```

```javascript
// lostpixel.config.ts
export const config = {
  storybookShots: {
    storybookUrl: './storybook-static'
  },
  generateOnly: true,
  failOnDifference: true
};
```

## ワークフロー

```
1. トークンまたはコンポーネント変更
2. Storybook ビルド → storybook-static/
3. lost-pixel update → ベースラインスクリーンショット更新
4. lost-pixel → ベースラインと比較、差分を検出
5. 差分レビュー → 承認またはロールバック
```

詳細な設定・CI 統合は次回対応。
