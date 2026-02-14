# Phase 07: デザイン → コード ハンドオフ

## 目的
PenpotのオープンスタンダードでスムーズなDev Handoffを実現する。

## Penpotでの操作

### Inspect タブ
1. 開発者はInspectタブからSVG、CSS、HTMLコードを即時取得
2. デザインがそのままWeb標準コードに変換

### Webhook / API 連携
1. Penpotのwebhooksでイベント通知
2. アクセストークンAPIでプログラムからアクセス
3. CI/CDパイプラインやコード生成ツールと連携

### MCP Server（実験的）
1. Penpot MCP Serverを使用
2. AIアシスタント経由でデザイン↔コード↔ドキュメントの双方向変換
3. Storybookプロジェクトの自動生成
4. LLM非依存（Claude, Cursor等で利用可）

## MCP によるコード生成

`penpot-init.js` 初期化後:

### CSS 生成

```javascript
penpot.generateStyle(shapes, { type: 'css', withChildren: true });
```

### HTML/SVG マークアップ生成

```javascript
penpot.generateMarkup(shapes, { type: 'html' });
penpot.generateMarkup(shapes, { type: 'svg' });
```

### トークン→コード変換
`storage.findToken(name)` でトークン名から値を取得し（見つからなければ登録済みトークン名を含むエラー）、CSS カスタムプロパティや設計変数として出力。`penpotUtils.tokenOverview()` でトークン一覧を確認。

### デザイン仕様のプログラム抽出
シェイプの fills/strokes/fontSize 等を `mcp__penpot-official__execute_code` で走査し、仕様書を自動生成。

## 成果物
- コードスニペット（CSS/HTML/SVG）
- API連携設定
- 開発者向けハンドオフドキュメント
