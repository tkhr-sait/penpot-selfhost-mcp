# Phase 03: Design Tokens の定義

## 目的
デザインシステムの最小単位となるトークンをPenpotのネイティブデザイントークン機能で定義・管理する。

## Penpotでの操作

### デザイントークン（ネイティブ）
1. Design Tokens パネルでトークンセット・テーマを管理
2. トークンタイプ: color, dimension, spacing, typography, shadow, opacity, borderRadius, borderWidth, fontWeights, fontSizes, fontFamilies, letterSpacing, textDecoration, textCase
3. トークンをシェイプに適用 → トークン値の変更がシェイプに自動反映

### スペーシング・レイアウト
1. Flex Layout / Grid Layout のルールを標準化
2. CSS Grid がPenpotでネイティブサポート
3. コンテナ間の余白やレスポンシブ挙動を定義

## MCP によるトークン一括登録

`activate` 実行後（storage ラッパー自動初期化）:

### トークンの登録（ネイティブ API）

`storage.ensureTokenSet` / `storage.ensureToken` / `storage.ensureTokenBatch` で冪等なトークン登録。
コード例 → [mcp-api.md #トークン登録パターン](../mcp-api.md#トークン登録パターン)

### テーマ作成・テーマ切替

Shared（ベース）→ Dark/Light（テーマ固有）の順にセットを作成し、同名トークンでテーマ間の値を切り替える。
コード例 → [mcp-api.md #テーマ構築フロー](../mcp-api.md#テーマ構築フローセット作成テーマ作成関連付け) / [#テーマ切替](../mcp-api.md#テーマ切替セットの-active-制御)

### スペーシングルール
`storage.spacing` (xs:4 〜 3xl:64) をプロジェクト標準として定義。

定義するトークンの具体値は [design.md](../design.md) を参照。

## 成果物
- デザイントークンセット（Penpot Native Design Tokens）
- テーマ定義（Dark / Light 等）
- スペーシングルール定義
