---
name: penpot
description: >-
  Penpot セルフホスト環境管理、MCP経由デザインシステム構築・UI/UXデザイン作成、
  外部パイプライン（トークン同期・Style Dictionary・Storybook）、コメント管理。
argument-hint: "[起動|停止|デザイン|デザインシステム|トークン同期|Storybook|コメント]"
---

# Penpot MCP Integration

$ARGUMENTS に応じてルーティングし、必要なリファレンス・スクリプトを Read して実行する。

## ツール名規約

本スキル内で使用するツールは以下の正式名称で呼び出すこと:

| 短縮形 | 正式ツール名 |
|--------|-------------|
| execute_code | `mcp__penpot-official__execute_code` |
| export_shape | `mcp__penpot-official__export_shape` |
| penpot_api_info | `mcp__penpot-official__penpot_api_info` |
| high_level_overview | `mcp__penpot-official__high_level_overview` |
| penpot-manage.sh | `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` |

> **注意**: `execute_code` 単体だと IDE の `mcp__ide__executeCode` にマッチする可能性がある。必ず `mcp__penpot-official__` プレフィックス付きで呼び出すこと。`penpot-manage.sh` も settings.json の許可パターンと一致させるため正式ツール名通りの相対パスで呼び出すこと。

**初期化**: ルートごとに「Read」列のファイルを Read する。`.js` は `mcp__penpot-official__execute_code` で初期化。

## ルーティングマップ

| $ARGUMENTS キーワード | セクション | Read |
|---|---|---|
| なし / 起動 / 設定 / 利用可能にして | [環境セットアップ](#環境セットアップ) | [selfhost.md](reference/selfhost.md) |
| 停止 / down / status / ログ | 環境セットアップ（コマンド実行） | — |
| DS構築 / トークン定義 | [デザインシステム構築](#デザインシステム構築) | [mcp-api.md](reference/mcp-api.md), [penpot-init.js](scripts/mcp-snippets/penpot-init.js), [token-utils.js](scripts/mcp-snippets/token-utils.js), [design.md](reference/design.md) + フェーズ誘導で該当ファイル |
| コンポーネント / ライブラリ | DS構築（Phase 04-05） | [mcp-api.md](reference/mcp-api.md), [penpot-init.js](scripts/mcp-snippets/penpot-init.js), [design.md](reference/design.md), [workflow/phase-04](reference/workflow/phase-04-components.md) or [05](reference/workflow/phase-05-library.md), [library-architecture.md](reference/library-architecture.md), [penpot-rest-api.js](scripts/mcp-snippets/penpot-rest-api.js) |
| デザイン / 画面 / UI | [デザイン作成](#デザイン作成) | [mcp-api.md](reference/mcp-api.md), [penpot-init.js](scripts/mcp-snippets/penpot-init.js), [token-utils.js](scripts/mcp-snippets/token-utils.js), [design.md](reference/design.md) |
| トークン同期 / DTCG | [外部パイプライン](#外部パイプライン)（01） | [mcp-api.md](reference/mcp-api.md), [pipeline/01-token-sync.md](reference/pipeline/01-token-sync.md), [token-sync.js](scripts/mcp-snippets/token-sync.js) |
| SD / CSS変数 / SCSS | 外部パイプライン（02） | [pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) |
| Storybook | 外部パイプライン（03） | [pipeline/03-storybook.md](reference/pipeline/03-storybook.md) |
| ドキュメント / Astro | 外部パイプライン（04） | [pipeline/04-docs.md](reference/pipeline/04-docs.md) |
| VRT / Lost Pixel | 外部パイプライン（05） | [pipeline/05-vrt.md](reference/pipeline/05-vrt.md) |
| パイプライン / 外部連携 | 外部パイプライン（全体） | [pipeline/overview.md](reference/pipeline/overview.md) |
| コメント / レビュー | [コメント管理](#コメント管理) | [mcp-api.md](reference/mcp-api.md), [penpot-init.js](scripts/mcp-snippets/penpot-init.js), [comments.md](reference/comments.md) |
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
5. MCP ツール（`mcp__penpot-official__execute_code` で `return 'ok'`）で動作確認
6. エラー時のみ `/mcp` → Reconnect を案内

停止: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh down` / 状態: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status` / ログ: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh logs`

**重要**: 環境操作は必ず `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` 経由。`docker compose` 直接実行はポート競合の原因。
**MCP再接続**: 予防的に依頼しない。MCP ツール呼び出しでエラー時のみ案内。案内時は「再接続後『続けて』と入力してください」と伝えること。

---

## デザインシステム構築

**前提**: MCP接続済み | **参照**: → [design.md](reference/design.md)

8フェーズで段階的に構築（01 監査 → 02 ラフスケッチ → 03 トークン定義 → 04 コンポーネント → 05 ライブラリ → 06 プロトタイプ → 07 ハンドオフ → 08 運用）。
全フェーズ共通で `penpot-init.js` を最初に `mcp__penpot-official__execute_code` で初期化する。

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

4フェーズ（理解→設計→実装→レビュー）で作成。レビュー時 → [validate-design.js](scripts/mcp-snippets/validate-design.js) で検証。

**操作完了時は `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh urls` の出力で確認用 URL を案内。**

---

## 外部パイプライン

**前提**: デザインシステム構築済み | **参照**: → [pipeline/overview.md](reference/pipeline/overview.md)

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

## API 制約（全操作共通）

- `mcp__penpot-official__high_level_overview` のシステムプロンプト遵守（insertChild、growType、Flex順序等）
- Plugin API `remove()` はコンポーネント削除に非永続 → REST API (`del-component` / `purge-component`)
- Plugin API 大量操作は WebSocket 切断リスク → バッチ分割 + sleep（token-sync.js 参照）または REST API で対処。切断しても MCP 再接続は不要（自動復帰）
- 完了後の検証: [validate-design.js](scripts/mcp-snippets/validate-design.js) で制約違反を検出
