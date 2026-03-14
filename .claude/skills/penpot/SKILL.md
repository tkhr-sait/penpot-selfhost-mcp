---
name: penpot
description: >-
  penpotを含む場合は必ず読み込む。セルフホスト環境管理、MCP経由デザインシステム構築・
  UI/UXデザイン作成・プロトタイプ参照、デザインからのアプリケーション生成、
  外部パイプライン（トークン同期・Style Dictionary・Storybook）、デザインレビュー・コメント操作。
argument-hint: "[起動|停止|デザイン|デザインシステム|アプリ作成|トークン同期|Storybook|レビュー|コメント]"
---

# Penpot MCP Integration

ユーザーのリクエスト内容に応じてルーティングし、必要なリファレンスを Read して実行する。
Claude Code では $ARGUMENTS、OpenCode ではスキルロード時のユーザーメッセージが対象。

## ツール名規約

本スキルではツールを以下の**短縮名**で参照する。MCP サーバー名は `penpot-official`。呼び出し時のプレフィックスはプラットフォームが自動付与する（Claude Code: `mcp__penpot-official__`、opencode: `penpot-official_` 等）。利用可能なツール一覧から短縮名に一致するものを使用すること。

| 短縮名 | 用途 |
|--------|------|
| `activate` | セッション開始・metrics 取得 |
| `execute_code` | Penpot 操作実行 |
| `export_shape` | シェイプ画像エクスポート |
| `penpot_api_info` | API 型情報取得 |
| `high_level_overview` | API 概要取得 |
| penpot-manage.sh | `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` |

> `execute_code` は Penpot MCP サーバー（`penpot-official`）のツールを使用すること。IDE の Jupyter 実行ツールとの混同に注意。`penpot-manage.sh` は上記パスで bash 実行。

**初期化**: `activate` を呼び出してセッション開始（storage ラッパー自動初期化）。ルートごとに「Read」列のファイルを Read する。

## ルーティングマップ

> リファレンスパスは本スキルディレクトリ（`.claude/skills/penpot/`）からの相対パス。

| キーワード | セクション | 実行 | Read |
|---|---|---|---|
| なし / 起動 / 設定 / 利用可能にして | [環境セットアップ](#環境セットアップ) | 親AI直接 | [selfhost.md](reference/core/selfhost.md) |
| 停止 / down / status / ログ | 環境セットアップ（コマンド実行） | 親AI直接 | — |
| DS構築 / トークン定義 / テーマ / ダーク / ライト | [デザインシステム構築](#デザインシステム構築) | **penpot-mcp** | [mcp-api.md](reference/core/mcp-api.md), [design.md](reference/core/design.md) + フェーズ誘導で該当ファイル |
| コンポーネント / ライブラリ | DS構築（Phase 04-05） | **penpot-mcp** | [mcp-api.md](reference/core/mcp-api.md), [design.md](reference/core/design.md), [workflow/phase-04](reference/workflow/phase-04-components.md) or [05](reference/workflow/phase-05-library.md), [library-architecture.md](reference/core/library-architecture.md) |
| デザイン / 画面 / UI / プロトタイプ | [デザイン作成](#デザイン作成) | **penpot-mcp** | [mcp-api.md](reference/core/mcp-api.md), [howto/](reference/howto/), [design.md](reference/core/design.md) |
| アプリ作成 / コード生成 / コード変換 | [アプリケーション作成](#アプリケーション作成) | **penpot-mcp** | [pipeline/overview.md](reference/pipeline/overview.md), [mcp-api.md](reference/core/mcp-api.md) |
| トークン同期 / DTCG | [外部パイプライン](#外部パイプライン)（01） | **penpot-mcp** | [mcp-api.md](reference/core/mcp-api.md), [pipeline/01-token-sync.md](reference/pipeline/01-token-sync.md) |
| SD / CSS変数 / SCSS | 外部パイプライン（02） | 親AI直接 | [pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) |
| Storybook | 外部パイプライン（03） | 親AI直接 | [pipeline/03-storybook.md](reference/pipeline/03-storybook.md) |
| VRT / Lost Pixel | 外部パイプライン（04） | 親AI直接 | [pipeline/04-vrt.md](reference/pipeline/04-vrt.md) |
| パイプライン / 外部連携 | 外部パイプライン（全体） | **penpot-mcp** | [pipeline/overview.md](reference/pipeline/overview.md) |
| レビュー / デザイン検証 | [デザインレビュー](#デザインレビュー) | **penpot-mcp** | [mcp-api.md](reference/core/mcp-api.md), [comments.md](reference/core/comments.md) |
| コメント | [コメント操作](#コメント操作) | **penpot-mcp** | [comments.md](reference/core/comments.md) |
| その他 | 引数内容に応じて判断 | — | — |

**実行ルール**: 「実行」列が **penpot-mcp** のルートでは、サブエージェントに委譲する（→ [委譲ルール](#サブエージェント委譲ルール)）。

---

## 環境セットアップ

**前提**: Docker 利用可能 | **参照**: → [selfhost.md](reference/core/selfhost.md)

起動: `penpot-manage.sh status` → `up` → `mcp-connect` → `wait-mcp claude`（OK まで待機）→ `activate`
停止: `penpot-manage.sh down` / 状態: `status` / ログ: `logs`

**重要**: 環境操作は必ず `penpot-manage.sh` 経由（`docker compose` 直接実行はポート競合の原因）。
**MCP再接続**: エラー時は `activate` を再度呼び出す。

---

## デザインシステム構築

**前提**: MCP接続済み | **参照**: → [design.md](reference/core/design.md)

8フェーズ（01 監査 → 02 ラフスケッチ → 03 トークン → 04 コンポーネント → 05 ライブラリ → 06 プロトタイプ → 07 ハンドオフ → 08 運用）。

**フェーズ判定**: `activate` 返却の `metrics` で状態確認
- `metrics.tokenSets` = 0 → Phase 01 or 03 から
- `metrics.tokenSets` > 0 + `metrics.components` = 0 → Phase 04 から
- `metrics.components` > 0 + `metrics.connectedLibs` = 0 → Phase 05 から
- 全 > 0 → Phase 07 or 08

**フェーズ誘導**（該当 workflow/ ファイルを Read）:
- 「ゼロから」→ [phase-01-audit.md](reference/workflow/phase-01-audit.md) から順に
- 「トークン整理」→ [phase-03-tokens.md](reference/workflow/phase-03-tokens.md)
- 「コンポーネント」→ [phase-04-components.md](reference/workflow/phase-04-components.md)
- 「ライブラリ分割」→ [phase-05-library.md](reference/workflow/phase-05-library.md) + [library-architecture.md](reference/core/library-architecture.md)
- 「コード連携」→ [phase-07-handoff.md](reference/workflow/phase-07-handoff.md)
- 「運用ルール」→ [phase-08-maintenance.md](reference/workflow/phase-08-maintenance.md)

**実装委譲**: フェーズファイルのコード例はサブエージェントへの指示用。

**スクリプト**: 監査 → `storage.validateDesign()` / トークン → `storage.exportTokensDTCG()` / `await storage.importTokensDTCG()`

---

## デザイン作成

**前提**: MCP接続済み | **参照**: → [design.md](reference/core/design.md)

4フェーズ（理解→設計→**実装**→レビュー）。Phase 1-2 は親AI直接、Phase 3 は penpot-mcp に委譲。

**Phase 3 開始ゲート（実装着手前に必ず確認）:**
1. 委譲テンプレート（7項目）を準備したか
2. 自分で `execute_code` を呼ぼうとしていないか — していたら中断、委譲に切り替え
3. デザイン仕様（[delegation-format.md](reference/core/delegation-format.md) 準拠）に以下が含まれるか:
   - ASCIIワイヤーフレームにボードの Flex alignment（中央配置等）を明記
   - 共通構造定義に全子要素（コンテナ・枠線・テキスト）の構造を記載
   - テキストコンテンツ一覧に全テキスト要素の fontSize / fontWeight / align を網羅

**実装判定**: `activate` 返却の `metrics` でスコープ決定
- `metrics.tokenSets` = 0 → `storage.ensureSemanticTokens()` でデフォルトトークン適用を指示に含め、画面構築と一括委譲（howto: [multi-screen-prototype.md](reference/howto/multi-screen-prototype.md)）
- `metrics.tokenSets` > 0 → 既存トークン使用。`ensureSemanticTokens` は呼ばない。画面構築のみ委譲

**howto 選択**: サブエージェントへの Read 指示に含める
- 複数画面 + テーマ → [multi-screen-prototype.md](reference/howto/multi-screen-prototype.md)
- 単一画面（ダッシュボード等） → [single-screen.md](reference/howto/single-screen.md)
- トークンのみ → [token-registration.md](reference/howto/token-registration.md)

**レビュー**: 2段階。①サブエージェントが自己レビュー（`validateDesign` + `export_shape`）実施済みで返却。②親AIが受入レビューを [デザインレビュー](#デザインレビュー) の委譲テンプレートで penpot-mcp に委譲（要件仕様をスコープに含め、変更なしで差分報告のみ）。完了時: `penpot-manage.sh urls` で URL 案内。

---

## アプリケーション作成

**前提**: MCP接続済み | **参照**: → [pipeline/overview.md](reference/pipeline/overview.md), [mcp-api.md](reference/core/mcp-api.md)

1. `activate` の `metrics` + `getPageContext()` でボード有無確認（なし → [デザイン作成](#デザイン作成)へ）
2. `metrics.tokenSets` > 0 → [外部パイプライン](#外部パイプライン)(01-02) でトークンを CSS 変数に変換 → コード実装
3. `metrics.tokenSets` = 0 → 直接値で実装（DS管理するなら [DS構築](#デザインシステム構築) Phase 03 でトークン定義）

**既存アプリ**: CSS からデザイン値抽出 → DS構築でトークン定義 → パイプライン 01-02 でエクスポート → ハードコード値をトークン変数に置換

---

## 外部パイプライン

**前提**: トークン定義済み | **参照**: → [pipeline/overview.md](reference/pipeline/overview.md)

Pipeline 01 の MCP 操作は penpot-mcp に委譲。Pipeline 02-04 は bash 操作のため親AI直接実行可。

**判定**: `tokens/` に JSON なし → 01 / `style-dictionary.config.*` なし → 02 / Storybook 未起動 → 03 / 全完了 → 04
該当 Pipeline のファイルを Read し手順に従う。

---

## デザインレビュー

**前提**: MCP接続済み | **参照**: → [comments.md](reference/core/comments.md)

レビュー（エクスポート→チェックリスト評価→指摘登録）は penpot-mcp にレビューモードとして委譲。

**委譲テンプレート（レビュー用）**（※ activate はサブエージェントが自律実行。「不要」指示禁止）:
1. **エージェント定義 Read**: `.claude/agents/penpot-mcp.md`（レビューモード参照）
2. **リファレンス Read**: `.claude/skills/penpot/reference/core/comments.md`（チェックリスト + コメント作成手順）
3. **対象**: ボード名 / ページ名
4. **スコープ**: 全般 or 限定（例:「A11y のみ」「カラーのみ」）、指摘コメント登録の要否
5. **成果物**: チェックリスト評価結果 + 差分報告（+ 登録コメント一覧）

デザイン作成フローの受入レビュー（Phase 4）もこの委譲テンプレートを使用。

---

## コメント操作

**前提**: MCP接続済み | **参照**: → [comments.md](reference/core/comments.md)

コメント CRUD（作成・取得・返信・解決・削除）は penpot-mcp に委譲。

**委譲テンプレート（コメント用）**（※ activate はサブエージェントが自律実行。「不要」指示禁止）:
1. **エージェント定義 Read**: `.claude/agents/penpot-mcp.md`
2. **リファレンス Read**: `.claude/skills/penpot/reference/core/comments.md`
3. **操作種別と対象**: 作成（ボード名 + 内容）/ 返信・解決（スレッド seqNumber）/ 取得 / 削除
4. **成果物**: 操作結果サマリ

---

## サブエージェント委譲ルール

MCP 操作（`execute_code` 等）は penpot-mcp サブエージェントに委譲する。

| プラットフォーム | 委譲方法 |
|---|---|
| Claude Code | Agent ツール（`subagent_type: "penpot-mcp"`） |
| opencode | Task ツール（`subagent_type: "penpot-mcp"`）or `@penpot-mcp` |
| VS Code Copilot | `agent` ツール経由(`@penpot-mcp`) |

**重要**: `activate` はサブエージェントが自身で呼び出す（親AIの初期化状態は引き継がれない）。委譲時に「activate 不要」「初期化済み」等の指示を含めないこと。

### 親AIのツール使用範囲

| ツール | 親AI | 用途 |
|--------|:---:|------|
| `activate` | ○ | セッション確認・metrics 取得 |
| `export_shape` | ○ | 単発の視覚確認 |
| `execute_code` | ✕ | サブエージェント経由 |
| `penpot_api_info` | ✕ | 同上 |
| `high_level_overview` | ✕ | 同上 |

### 委譲テンプレート

サブエージェントには以下を含めること:
1. **エージェント定義 Read**: `.claude/agents/penpot-mcp.md`
2. **作業スコープ**: metrics 判定に基づく「やること・やらないこと」
3. **参考リファレンス**: ルーティングで Read したリファレンスのパスを列挙
4. **storage 状態**: 既存ボードの ID/名前
5. **成果物定義**: 何を作り、何を返すか
6. **デザイン仕様**: → [delegation-format.md](reference/core/delegation-format.md)
7. **エラー時**: エージェント定義のエラー回復戦略に従う旨

> ※ `activate` はテンプレートに含めない — サブエージェントがエージェント定義に従い自律実行する。

---

## 補足

- plan 復帰時はコンテキスト圧縮でスキル知識が消失している可能性あり。**plan Step 1 に `/penpot` スキルリロードを含めること。**
- 複合タスクでは `.penpot-task.md` に計画・進捗・キーパスを記録し、コンテキスト圧縮時に Read して復元
- API 制約 → [mcp-api.md「Plugin API 実践的制約」](reference/core/mcp-api.md#plugin-api-実践的制約)
