# Phase 08: 運用・メンテナンス

## 目的
デザインシステムを「生きたドキュメント」として継続的に改善する。

## 作業手順

### 定期レビューサイクル
- 月次または四半期でデザインシステムの利用状況をレビュー
- 非推奨コンポーネントの廃止を判断
- 新パターンの追加を検討

### 変更ログとバージョニング
- ライブラリ更新時にCHANGELOGを記録
- Connected Librariesの通知機能で各プロジェクトへ変更を伝搬
- Gitと連携してバージョン管理

### コントリビューションガイド
- 新コンポーネントの提案プロセスを文書化
- レビュー基準を明確化
- 命名規則・品質基準を維持

## MCP による自動監査・メンテナンス

`penpot-init.js` 初期化後:

### validate-design.js で定期チェック
フォント・テキストサイズ・growType の違反を自動検出。

### 一貫性チェック（拡張）
- `penpotUtils.findTokenByName()` （または `storage.findTokenOrNull()` ）/ `penpotUtils.tokenOverview()` でネイティブトークンと実使用色を突合 → 未登録カラー検出
- `storage.spacing` の値で parentX/parentY を検証 → グリッド逸脱検出
- `penpotUtils.analyzeDescendants()` でボード単位の制約検証

### 未対応フィードバック確認
`storage.getFileComments()` で全ページの未解決コメントを取得し、対応状況を確認。

## 成果物
- レビュー議事録
- CHANGELOG
- コントリビューションガイドドキュメント
