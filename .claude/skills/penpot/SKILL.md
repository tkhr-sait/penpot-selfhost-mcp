---
name: penpot
description: >-
  セルフホストPenpotのDocker環境管理（起動・停止）、MCP接続管理、
  Penpotでのデザインシステム構築（監査・トークン・コンポーネント・ライブラリ・運用）、
  MCP経由のUI/UXデザイン作成（画面設計・ワイヤーフレーム・UIコンポーネント）、
  およびコメント管理。
argument-hint: "[例: 起動, 停止, ダッシュボード画面をデザイン, デザインシステムを構築, ライブラリを整理]"
---

# Penpot MCP Integration

Penpot セルフホスト環境の管理 + デザインシステム構築 + MCP経由のUI/UXデザイン作成を統合したスキルです。

## サポートファイル

### リファレンス

- [reference/selfhost.md](reference/selfhost.md) — セルフホスト環境（サービス構成、ユーザー、ポート、コマンド、手動接続、環境変数）
- [reference/mcp-api.md](reference/mcp-api.md) — MCP API（Plugin API、シェイプ操作、レイアウト、ライブラリ）
- [reference/design.md](reference/design.md) — デザインワークフロー・原則・カラートークン・タイポグラフィ

#### 必要時のみ参照（読み込み不要、該当タスク時のみ Read）

- [reference/workflow-phases.md](reference/workflow-phases.md) — デザインシステム8フェーズの詳細手順・MCP操作
- [reference/library-architecture.md](reference/library-architecture.md) — ライブラリ分割戦略・依存関係・MCP操作

### スクリプト

- [scripts/penpot-selfhost/penpot-manage.sh](scripts/penpot-selfhost/penpot-manage.sh) — メイン管理スクリプト
- [scripts/mcp-snippets/penpot-init.js](scripts/mcp-snippets/penpot-init.js) — デザインユーティリティ初期化
- [scripts/mcp-snippets/penpot-rest-api.js](scripts/mcp-snippets/penpot-rest-api.js) — REST APIユーティリティ（ライブラリ管理・ファイル操作・ファイル切替）
- [scripts/mcp-snippets/validate-design.js](scripts/mcp-snippets/validate-design.js) — デザイン制約検証
- `scripts/penpot-selfhost/` — Docker インフラ + 管理スクリプト
- `scripts/penpot-selfhost/mcp-connect/` — Playwright 自動接続

---

## 環境管理: 起動〜MCP接続

「起動して」「設定して」「利用可能にして」等の要求には **全ステップを自動実行**:

1. **Docker起動**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up`
2. **MCP接続**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect`
3. **MCP接続確認**: MCP ツール（例: `execute_code`）を実際に呼び出して接続を確認。エラー時のみ `/mcp` → Reconnect を案内
4. **完了報告**: Penpot UI (`PENPOT_PUBLIC_URI`) / MCP 接続状態

**起動判定**: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status` で確認してから実行。
**MCP利用判定**: MCP接続後、最初のデザイン操作前に `mcp__penpot-official__high_level_overview` ツールを呼び出して Penpot Plugin API の制約事項を確認すること（システムプロンプトに既読の場合は不要）。

**重要: 環境操作は必ず `penpot-manage.sh` 経由で行うこと。** `docker compose` 直接実行は別プロジェクト名でコンテナが作成され、ポート競合の原因になる。
**MCP再接続**: 予防的に `/mcp` 再接続を依頼しない。まず MCP ツールを実際に呼び出し、接続エラーが発生した場合にのみ再接続を案内すること。

詳細（ユーザーアカウント、ポート、コマンド一覧、手動接続手順等）は [reference/selfhost.md](reference/selfhost.md) を参照。

---

## Claude Code / Copilot の並行運用

Claude Code と GitHub Copilot はそれぞれ専用の MCP サーバーインスタンス・専用ユーザーで動作するため、**同時接続が可能**。特別な設定は不要。

| AI ツール      | MCP HTTP ポート | 専用ユーザー               |
| -------------- | --------------- | -------------------------- |
| Claude Code    | 4401            | `mcp-claude@penpot.local`  |
| GitHub Copilot | 4411            | `mcp-copilot@penpot.local` |

---

## デザインシステム構築

「デザインシステムを作りたい」「トークンを整理したい」「コンポーネントを体系化したい」「ライブラリを構成したい」等の要求時に使用。全フェーズで MCP (`execute_code`) を最大限活用する。

### ワークフロー全体像

```
01 監査・棚卸し
  ↓
02 ラフスケッチ・ワイヤーフレーム
  ↓
03 Design Tokens の定義
  ↓
04 コンポーネント設計・構築
  ↓
05 ライブラリ構成・共有
  ↓
06 プロトタイピング・検証
  ↓
07 デザイン → コード ハンドオフ
  ↓
08 運用・メンテナンス ← 必要に応じて 03〜07 へ戻る
```

各フェーズの詳細手順・MCP操作は [reference/workflow-phases.md](reference/workflow-phases.md) を参照。

### MCP 活用方針

- 全フェーズ共通で `penpot-init.js` を最初に初期化
- Phase 01: `storage.getToken()` + `validate-design.js` で自動監査
- Phase 02: `storage.createAndOpenPage()` + `storage.createText()` + `storage.spacing` でワイヤーフレーム
- Phase 03: 共有ライブラリへ `execInFile` で直接登録（ローカルとの二重管理禁止）
- Phase 04: コンポーネント命名は `path` と `name` を個別に設定。デザイン実装は「デザイン作成」セクションの4フェーズに従う
- Phase 05: `penpot-rest-api.js` 初期化 → `createFile` / `setFileShared` / `linkLibrary` でライブラリ構築。`duplicateFile` 利用時は不要ページ・不要接続を整理。詳細は [reference/library-architecture.md](reference/library-architecture.md) と [reference/mcp-api.md](reference/mcp-api.md) を参照
- Phase 06: デザイン実装は「デザイン作成」セクションの4フェーズ（理解→設計→実装→レビュー）に従う
- Phase 07: `penpot.generateStyle()` / `generateMarkup()` + `storage.getToken()` でコード生成
- Phase 08: `validate-design.js` + `storage.getFileComments()` で定期監査

トークンの具体値（カラー・タイポグラフィ）は [reference/design.md](reference/design.md) を参照。

### ユーザー状況に応じたフェーズ誘導

- 「ゼロから始めたい」→ Phase 01 から
- 「既存UIがバラバラ」→ Phase 01 の重複・不整合の洗い出しから
- 「トークンを整理したい」→ Phase 03 から
- 「コンポーネントを作りたい」→ Phase 04 から
- 「ライブラリを分割したい」→ Phase 05 から
- 「コードとの連携を改善したい」→ Phase 07 から
- 「運用ルールを決めたい」→ Phase 08 から

### Penpot ベストプラクティス

- **スラッシュ命名で階層化**: `Category / Subcategory / Name` でAssetsを自動グルーピング
- **Shared Lib は読み取り専用**: 接続先からアセット編集不可。誤変更を防止
- **空ボードもコンポーネントに**: レイアウトルールだけのボードも保存可能
- **CSS Grid ネイティブサポート**: デザインとコードのレイアウトが完全一致

---

## デザイン作成

「デザインして」「画面を作って」等の要求時に使用。Penpot + MCP 接続済みが前提。

### ワークフロー（詳細: [reference/design.md](reference/design.md)）

1. **理解** — 指示を分析、曖昧なら questions-guide.md を Read してヒアリング
2. **設計** — レイアウト・カラー・タイポグラフィ方針を提示
3. **実装** — `scripts/mcp-snippets/penpot-init.js` を Read → execute_code で初期化し MCP 経由で作成
4. **レビュー** — `scripts/mcp-snippets/validate-design.js` で検証 → `export_shape` でエクスポート → 確認 → 修正

### 実装ルール

#### ページ管理
- `storage.createAndOpenPage(name)` 必須（空の Page 1 自動再利用、切替忘れ防止）
- 最低1ページ制約（最後のページは削除不可）
- ページ切替: `penpot.openPage(page, false)` — 第2引数 `false` 必須
- 複数ページ作業時は `storage.assertCurrentPage(page)` でシェイプ作成前に検証
- プロトタイプ: インタラクションは同一ページ内のみ（異なるページ間は動作しない）

#### フォント
- **`fontFamily: "sourcesanspro"` のみ**（セルフホスト環境の唯一のビルトインフォント）

#### ライブラリ管理
- 共有ライブラリに一本化（ローカルとの二重管理禁止）
- `getToken()` はローカル + 接続ライブラリを検索
- ライブラリ間の依存接続必須（UI Components → Colors / Typography）
- コンポーネント命名: `path` と `name` を個別に設定（スラッシュ記法の `name` 一括設定は path 二重化の原因）
- 詳細は [reference/mcp-api.md](reference/mcp-api.md) と [reference/library-architecture.md](reference/library-architecture.md) を参照

#### API 制約・注意
- `high_level_overview` のシステムプロンプト遵守（insertChild、growType、Flex順序等）
- Plugin API `remove()` は非永続 → アセット削除は REST API を使う
- Plugin API 大量操作は WebSocket 切断リスク → REST API 優先
- デザイン完了後: `validate-design.js` で制約違反を検出
- 詳細は [reference/mcp-api.md](reference/mcp-api.md) を参照

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
- 「デザインシステム」「DS構築」「トークン定義」「コンポーネント整理」→ デザインシステム構築ワークフロー開始
- 「ライブラリ」「ライブラリ構成」「ライブラリ分割」→ デザインシステム Phase 05 から開始
- 「コメント」「コメント確認」「レビュー」→ コメント確認・返信ワークフロー開始
- その他 → 引数内容に応じた操作
