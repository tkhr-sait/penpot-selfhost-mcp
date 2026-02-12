---
name: penpot
description: >-
  セルフホストPenpotのDocker環境管理（起動・停止）、MCP接続管理、
  およびPenpotでのUI/UXデザイン作成（画面設計・ワイヤーフレーム・UIコンポーネント）。
argument-hint: "[例: 起動, 停止, ダッシュボード画面をデザイン]"
---

# Penpot MCP Integration

Penpot セルフホスト環境の管理 + MCP経由のUI/UXデザイン作成を統合したスキルです。

## サポートファイル

### リファレンス

- [reference/selfhost.md](reference/selfhost.md) — セルフホスト環境（サービス構成、ユーザー、ポート、コマンド、手動接続、環境変数）
- [reference/github-copilot.md](reference/github-copilot.md) — GitHub Copilot (VS Code) での接続・利用ガイド
- [reference/mcp-api.md](reference/mcp-api.md) — MCP API（Plugin API、シェイプ操作、レイアウト、ライブラリ）
- [reference/design.md](reference/design.md) — デザインワークフロー・原則・カラートークン・タイポグラフィ

#### 必要時のみ参照（読み込み不要、該当タスク時のみ Read）

- [reference/questions-guide.md](reference/questions-guide.md) — ヒアリングフレームワーク（曖昧な指示の場合のみ）
- [reference/penpot-guide.md](reference/penpot-guide.md) — Penpot 本体ユーザーガイド（Penpot UI概念の質問時のみ）

### スクリプト

- [scripts/penpot-selfhost/penpot-manage.sh](scripts/penpot-selfhost/penpot-manage.sh) — メイン管理スクリプト
- [scripts/mcp-snippets/penpot-init.js](scripts/mcp-snippets/penpot-init.js) — デザインユーティリティ初期化
- [scripts/mcp-snippets/validate-design.js](scripts/mcp-snippets/validate-design.js) — デザイン制約検証
- `scripts/penpot-selfhost/` — Docker インフラ + 管理スクリプト
- `scripts/penpot-selfhost/mcp-connect/` — Playwright 自動接続

---

## 環境管理: 起動〜MCP接続

「起動して」「設定して」「利用可能にして」等の要求には **全ステップを自動実行**:

1. **Docker起動**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up`
2. **MCP接続**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect`
3. **MCP再接続案内**: `/mcp` → `penpot-official` → Reconnect
4. **完了報告**: Penpot UI (`PENPOT_PUBLIC_URI`) / MCP 接続状態

**起動判定**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status` で確認してから実行。
**MCP利用判定**: MCP接続後、最初のデザイン操作前に `mcp__penpot-official__high_level_overview` ツールを呼び出して Penpot Plugin API の制約事項を確認すること（システムプロンプトに既読の場合は不要）。

詳細（ユーザーアカウント、ポート、コマンド一覧、手動接続手順等）は [reference/selfhost.md](reference/selfhost.md) を参照。

---

## Claude Code / Copilot の並行運用

Claude Code と GitHub Copilot はそれぞれ専用の MCP サーバーインスタンス・専用ユーザーで動作するため、**同時接続が可能**。特別な設定は不要。

| AI ツール      | MCP HTTP ポート | 専用ユーザー               |
| -------------- | --------------- | -------------------------- |
| Claude Code    | 4401            | `mcp-claude@penpot.local`  |
| GitHub Copilot | 4411            | `mcp-copilot@penpot.local` |

---

## デザイン作成

「デザインして」「画面を作って」等の要求時に使用。Penpot + MCP 接続済みが前提。

### ワークフロー（詳細: [reference/design.md](reference/design.md)）

1. **理解** — 指示を分析、曖昧なら questions-guide.md を Read してヒアリング
2. **設計** — レイアウト・カラー・タイポグラフィ方針を提示
3. **実装** — `scripts/mcp-snippets/penpot-init.js` を Read → execute_code で初期化し MCP 経由で作成
4. **レビュー** — `scripts/mcp-snippets/validate-design.js` で検証 → `export_shape` でエクスポート → 確認 → 修正

### 実装ルール（最重要）

- フォント: **`fontFamily: "sourcesanspro"` のみ**（セルフホスト固有）
- **ページ作成: `storage.createAndOpenPage(name)` を必ず使用**（`penpot.createPage()` 単体はページ切替されず、元ページにシェイプが配置されるミスの原因）
- ページ切替: `penpot.openPage(page, false)` — 第2引数 `false` 必須
- 複数ページ作業時は `storage.assertCurrentPage(page)` でシェイプ作成前に検証
- **プロトタイプ**: インタラクション（Navigate to 等）の起点と遷移先ボードは**同一ページ内**に配置すること。異なるページ間のインタラクションは動作しない
- **API制約**: `high_level_overview` のシステムプロンプトを必ず遵守（insertChild、growType、Flex順序等）
- 詳細は [reference/mcp-api.md](reference/mcp-api.md) を参照
- **デザイン完了後**: `scripts/mcp-snippets/validate-design.js` を Read → execute_code で制約違反を検出
- **画像エクスポート**: `board.export({ type: 'png', scale: 1.5 })` を推奨（2100x1500相当、ファイルサイズと解像度のバランスが良い）

---

## コメント確認・返信

「コメント確認して」「コメントに返信して」等の要求時に使用。MCP接続済みが前提。

1. **確認**: ユーティリティ初期化後、`await storage.getFileComments()` で全ページの未解決コメントを取得
2. **対応**: 該当ページに移動 → コメント内容確認 → 修正・返信・解決

```javascript
// MCP で未解決コメントを取得（現在のページ）
const threads = await penpot.currentPage.findCommentThreads({
  onlyActive: true,
  showResolved: false,
});

// コメント一覧を取得
const comments = await thread.findComments();

// 返信
await thread.reply("修正しました");

// 解決済みにする
thread.resolved = true;
```

詳細は [reference/mcp-api.md](reference/mcp-api.md) のコメント操作セクションを参照。

---

## 引数処理

$ARGUMENTS をもとに適切な操作を実行する。

- 引数なし / 「起動」「設定」「利用可能にして」→ 環境管理の自動化フロー全ステップ実行
- 「停止」「down」→ `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh down`
- 「状態」「status」→ `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status`
- 「ログ」→ `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh logs`
- 「デザイン」「画面」「UI」等 → デザイン作成ワークフロー開始
- 「コメント」「コメント確認」「レビュー」→ コメント確認・返信ワークフロー開始
- その他 → 引数内容に応じた操作
