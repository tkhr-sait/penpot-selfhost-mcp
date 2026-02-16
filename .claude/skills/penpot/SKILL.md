---
name: penpot
description: >-
  penpotを含む場合は必ず読み込む。セルフホスト環境管理、MCP経由デザインシステム構築・
  UI/UXデザイン作成・プロトタイプ参照、デザインからのアプリケーション生成、
  外部パイプライン（トークン同期・Style Dictionary・Storybook）、コメント管理。
argument-hint: "[起動|停止|デザイン|デザインシステム|アプリ作成|トークン同期|Storybook|コメント]"
---

# Penpot MCP Integration

$ARGUMENTS に応じてルーティングし、必要なリファレンス・スクリプトを Read して実行する。

## ツール名規約

本スキル内で使用するツールは以下の正式名称で呼び出すこと:

| 短縮形 | 正式ツール名 |
|--------|-------------|
| activate | `mcp__penpot-official__activate` |
| execute_code | `mcp__penpot-official__execute_code` |
| export_shape | `mcp__penpot-official__export_shape` |
| penpot_api_info | `mcp__penpot-official__penpot_api_info` |
| high_level_overview | `mcp__penpot-official__high_level_overview` |
| penpot-manage.sh | `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` |

> **注意**: `execute_code` 単体だと IDE の `mcp__ide__executeCode` にマッチする可能性がある。必ず `mcp__penpot-official__` プレフィックス付きで呼び出すこと。`penpot-manage.sh` も settings.json の許可パターンと一致させるため正式ツール名通りの相対パスで呼び出すこと。

**初期化**: `mcp__penpot-official__activate` を呼び出してセッション開始（penpot-init.js 自動実行）。ルートごとに「Read」列のファイルを Read する。追加の `.js`（token-utils.js 等）は `mcp__penpot-official__execute_code` で初期化。

## ルーティングマップ

| $ARGUMENTS キーワード | セクション | Read |
|---|---|---|
| なし / 起動 / 設定 / 利用可能にして | [環境セットアップ](#環境セットアップ) | [selfhost.md](reference/selfhost.md) |
| 停止 / down / status / ログ | 環境セットアップ（コマンド実行） | — |
| DS構築 / トークン定義 | [デザインシステム構築](#デザインシステム構築) | [mcp-api.md](reference/mcp-api.md), [token-utils.js](scripts/mcp-snippets/token-utils.js), [design.md](reference/design.md) + フェーズ誘導で該当ファイル |
| コンポーネント / ライブラリ | DS構築（Phase 04-05） | [mcp-api.md](reference/mcp-api.md), [design.md](reference/design.md), [workflow/phase-04](reference/workflow/phase-04-components.md) or [05](reference/workflow/phase-05-library.md), [library-architecture.md](reference/library-architecture.md), [penpot-rest-api.js](scripts/mcp-snippets/penpot-rest-api.js) |
| デザイン / 画面 / UI | [デザイン作成](#デザイン作成) | [mcp-api.md](reference/mcp-api.md), [token-utils.js](scripts/mcp-snippets/token-utils.js), [design.md](reference/design.md) |
| アプリ作成 / コード生成 / コード変換 | [アプリケーション作成](#アプリケーション作成) | [token-sync.js](scripts/mcp-snippets/token-sync.js), [pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) |
| トークン同期 / DTCG | [外部パイプライン](#外部パイプライン)（01） | [mcp-api.md](reference/mcp-api.md), [pipeline/01-token-sync.md](reference/pipeline/01-token-sync.md), [token-sync.js](scripts/mcp-snippets/token-sync.js) |
| SD / CSS変数 / SCSS | 外部パイプライン（02） | [pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) |
| Storybook | 外部パイプライン（03） | [pipeline/03-storybook.md](reference/pipeline/03-storybook.md) |
| ドキュメント / Astro | 外部パイプライン（04） | [pipeline/04-docs.md](reference/pipeline/04-docs.md) |
| VRT / Lost Pixel | 外部パイプライン（05） | [pipeline/05-vrt.md](reference/pipeline/05-vrt.md) |
| パイプライン / 外部連携 | 外部パイプライン（全体） | [pipeline/overview.md](reference/pipeline/overview.md) |
| コメント / レビュー | [コメント管理](#コメント管理) | [mcp-api.md](reference/mcp-api.md), [comments.md](reference/comments.md) |
| その他 | 引数内容に応じて判断 | — |

## サポートファイル一覧

**リファレンス**: [selfhost.md](reference/selfhost.md) | [mcp-api.md](reference/mcp-api.md) | [comments.md](reference/comments.md) | [design.md](reference/design.md) | [workflow/phase-01〜08](reference/workflow/) | [library-architecture.md](reference/library-architecture.md) | [pipeline/overview + 01〜05](reference/pipeline/)

**スクリプト**: [penpot-manage.sh](scripts/penpot-selfhost/penpot-manage.sh) | [penpot-init.js](scripts/mcp-snippets/penpot-init.js) | [penpot-rest-api.js](scripts/mcp-snippets/penpot-rest-api.js) | [validate-design.js](scripts/mcp-snippets/validate-design.js) | [token-sync.js](scripts/mcp-snippets/token-sync.js) | [token-utils.js](scripts/mcp-snippets/token-utils.js)

---

## 環境セットアップ

**前提**: Docker 利用可能 | **参照**: → [selfhost.md](reference/selfhost.md)

「起動して」等の要求には以下を自動実行:

1. `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status` で状態確認
2. `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up` で Docker 起動
3. `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect` で MCP 接続開始
4. ログで接続完了を待つ:
   `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh logs penpot-mcp-connect-claude 2>&1 | grep -m1 "MCP connected"`
   （mcp-connect.mjs が "MCP connected. Browser will stay open." を出力したら完了）
5. `mcp__penpot-official__activate` でセッション開始（penpot-init.js 自動実行 + 動作確認）
6. エラー時は `activate` を再度呼び出す

停止: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh down` / 状態: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status` / ログ: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh logs`

**重要**: 環境操作は必ず `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` 経由。`docker compose` 直接実行はポート競合の原因。
**MCP再接続**: ツール呼び出しエラー時は `mcp__penpot-official__activate` を再度呼び出す。ユーザーへの `/mcp` → Reconnect 案内は不要。

---

## デザインシステム構築

**前提**: MCP接続済み | **参照**: → [design.md](reference/design.md)

8フェーズで段階的に構築（01 監査 → 02 ラフスケッチ → 03 トークン定義 → 04 コンポーネント → 05 ライブラリ → 06 プロトタイプ → 07 ハンドオフ → 08 運用）。
全フェーズ共通で `mcp__penpot-official__activate` でセッション開始する（penpot-init.js 自動実行）。

**フェーズ判定**（キーワードが曖昧な場合）: `mcp__penpot-official__execute_code` で状態確認
- `(penpot.library.local.tokens?.sets?.length ?? 0)` = 0 → Phase 01 or 03 から
- トークンあり + `penpot.library.local.components.length` = 0 → Phase 04 から
- コンポーネントあり + `penpot.library.connected.length` = 0 → Phase 05 から
- 全あり → Phase 07 or 08

**フェーズ誘導**（該当フェーズの workflow/ ファイルを Read）:
- 「ゼロから」→ [phase-01-audit.md](reference/workflow/phase-01-audit.md) から順に
- 「トークン整理」→ [phase-03-tokens.md](reference/workflow/phase-03-tokens.md)
- 「コンポーネント」→ [phase-04-components.md](reference/workflow/phase-04-components.md)
- 「ライブラリ分割」→ [phase-05-library.md](reference/workflow/phase-05-library.md) + [library-architecture.md](reference/library-architecture.md) + [penpot-rest-api.js](scripts/mcp-snippets/penpot-rest-api.js)
- 「コード連携」→ [phase-07-handoff.md](reference/workflow/phase-07-handoff.md)
- 「運用ルール」→ [phase-08-maintenance.md](reference/workflow/phase-08-maintenance.md)

**追加スクリプト**: Phase 01/08 監査 → [validate-design.js](scripts/mcp-snippets/validate-design.js) / Phase 03 トークン定義 → [token-utils.js](scripts/mcp-snippets/token-utils.js) / Phase 03 トークン import/export → [token-sync.js](scripts/mcp-snippets/token-sync.js)

---

## デザイン作成

**前提**: MCP接続済み | **参照**: → [design.md](reference/design.md)

4フェーズ（理解→設計→**実装**→レビュー）で作成。

Phase 1-2（理解・設計）はスキル内、Phase 3（実装）は penpot-mcp サブエージェントに委譲。
委譲の判定・指示方法は [サブエージェント委譲戦略](#サブエージェント委譲戦略) を参照。

**レビュー**: `mcp__penpot-official__export_shape` で確認 → [validate-design.js](scripts/mcp-snippets/validate-design.js) で検証。
**操作完了時は `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh urls` の出力で確認用 URL を案内。**

**次のステップ**: デザインにトークンが定義されている場合、アプリケーション側で利用するには [外部パイプライン](#外部パイプライン)(01-02) で CSS 変数に変換する。全体フローは [アプリケーション作成](#アプリケーション作成) を参照。

---

## アプリケーション作成

**前提**: MCP接続済み

Penpot のデザインをもとにアプリケーションコードを生成する、または既存アプリを Penpot のデザインシステム管理下に置くためのフロー。
**Penpot にトークンが定義されている場合はパイプライン経由で CSS 変数として利用すること。**

### フロー判定

1. **デザイン確認**: `penpotUtils.shapeStructure(penpot.root, 1)` でボードの有無を確認
   - なし → [デザイン作成](#デザイン作成) を先に実行
2. **トークン確認**: `penpotUtils.tokenOverview()` でトークンの有無を確認
   - あり → Step 3 へ
   - なし → 直接値で実装可。DS管理を始めるなら [デザインシステム構築](#デザインシステム構築) Phase 03 でトークン定義
3. **パイプライン実行**:
   - `storage.exportTokensDTCG()` → Write ツールで `tokens/` に DTCG JSON 保存
   - SD 設定作成（[pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) のテンプレート参照）
   - `npm run tokens:build` で CSS 変数生成
4. **コード実装**: 生成された CSS 変数（`--ds-*`）を使用してアプリを構築。
   デザイン情報は `penpot.generateStyle()`, `penpot.generateMarkup()`, `export_shape` で抽出

### 既存アプリへの適用

1. 既存アプリの CSS からデザイン値を抽出
2. [デザインシステム構築](#デザインシステム構築) で Penpot にトークンを定義
3. [外部パイプライン](#外部パイプライン)(01-02) でエクスポート
4. 既存 CSS のハードコード値をトークン変数に置換

---

## 外部パイプライン

**前提**: Penpot にトークンが定義されていること | **参照**: → [pipeline/overview.md](reference/pipeline/overview.md)

**パイプライン判定**（キーワードが曖昧な場合）: Bash で状態確認
- `tokens/` に JSON なし → Pipeline 01（トークンエクスポートから）
- `style-dictionary.config.*` なし → Pipeline 02（SD セットアップから）
- `build/css/` なし → Pipeline 02（SD ビルドから）
- Storybook 未起動 → Pipeline 03
- 全完了 → Pipeline 04 or 05

該当 Pipeline のファイルを Read し手順に従う。トークン操作時は [token-sync.js](scripts/mcp-snippets/token-sync.js) を Read → `mcp__penpot-official__execute_code` で初期化。

---

## コメント管理

**前提**: MCP接続済み | **参照**: → [comments.md](reference/comments.md)

1. `await storage.getFileComments()` で未解決コメントを取得
2. 該当ページに移動 → 内容確認 → 修正・返信（`thread.reply()`）・解決（`thread.resolved = true`）

---

## 実装フェーズの開始手順

計画モードから復帰して実装を開始する際、コンテキスト圧縮によりスキル内容が失われている可能性がある。以下を必ず実行すること:

**plan 作成時（Claude Code）**: plan の Step 1 に `/penpot` スキルリロード（Skill ツール）を含めること。
コンテキストクリア後の plan 実行時にスキル知識が自動復元される。

1. **スキルロード**: `/penpot` でスキルを呼び出す（Skill ツール）。
   スキル未ロード時はルーティングマップ・初期化手順・サブエージェント戦略が利用不可。
2. **セッション開始**: `mcp__penpot-official__activate` を呼び出す（penpot-init.js 自動実行）。
3. **リファレンス再読込**: ルーティングマップの「Read」列に記載されたファイルを Read し直す
4. **サブエージェント委譲**: MCP execute_code が多数必要な操作（トークンエクスポート、デザイン構築等）は `penpot-mcp` サブエージェントに委譲する（→ [サブエージェント委譲戦略](#サブエージェント委譲戦略)）

---

## サブエージェント委譲戦略

MCP execute_code の大量呼び出し（10〜30回）によるコンテキスト消費を防ぐため、実装フェーズは `penpot-mcp` サブエージェントに委譲する。

### 委譲すべきタスク

| タスク | 委譲 | 理由 |
|--------|------|------|
| 画面構築（ボード + 子要素） | ✅ | execute_code 多数 |
| トークン一括定義 | ✅ | バッチ操作 |
| コンポーネント作成 | ✅ | execute_code 多数 |
| インタラクション設定 | ✅ | API 型確認 + 設定 |
| export_shape でレビュー | ⚠️ 場合による | 1回なら直接、複数なら委譲 |
| 環境起動/停止 | ❌ | Bash コマンドのみ |
| ユーザーへの質問 | ❌ | AskUserQuestion はスキル内 |

### サブエージェントへの指示テンプレート

サブエージェントには以下を必ず含めること:
1. **エージェント定義の Read 指示**: `.claude/agents/penpot-mcp.md` を最初に Read
2. **storage の現在状態**: 初期化済みヘルパー、既存ボードの ID/名前
3. **具体的な成果物定義**: 何を作り、何を返すか
4. **デザイン仕様**: カラー、サイズ、レイアウト、テキスト内容

### GitHub Copilot 用エージェント
Copilot Agent Mode 用は `.github/agents/penpot-mcp.agent.md`。Claude Code 版と同等だがツール名形式が異なる（`penpot-official/*` vs `mcp__penpot-official__*`）。

---

## 複合タスクの実行管理

複合タスクでは `.penpot-task.md` に計画・進捗・キーパスを記録し、コンテキスト圧縮時に Read して復元。

## API 制約（全操作共通）

→ [mcp-api.md の「Plugin API 実践的制約」](reference/mcp-api.md#plugin-api-実践的制約) を参照
