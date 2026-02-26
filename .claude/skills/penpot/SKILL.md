---
name: penpot
description: >-
  penpotを含む場合は必ず読み込む。セルフホスト環境管理、MCP経由デザインシステム構築・
  UI/UXデザイン作成・プロトタイプ参照、デザインからのアプリケーション生成、
  外部パイプライン（トークン同期・Style Dictionary・Storybook）、デザインレビュー・コメント操作。
argument-hint: "[起動|停止|デザイン|デザインシステム|アプリ作成|トークン同期|Storybook|レビュー|コメント]"
---

# Penpot MCP Integration

$ARGUMENTS に応じてルーティングし、必要なリファレンスを Read して実行する。

## ツール名規約

| 短縮形 | 正式ツール名 |
|--------|-------------|
| activate | `mcp__penpot-official__activate` |
| execute_code | `mcp__penpot-official__execute_code` |
| export_shape | `mcp__penpot-official__export_shape` |
| penpot_api_info | `mcp__penpot-official__penpot_api_info` |
| high_level_overview | `mcp__penpot-official__high_level_overview` |
| penpot-manage.sh | `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh` |

> `execute_code` は必ず `mcp__penpot-official__` プレフィックス付きで呼び出すこと（IDE の `mcp__ide__executeCode` との混同防止）。`penpot-manage.sh` も正式ツール名通りの相対パスで呼び出すこと。

**初期化**: `activate` を呼び出してセッション開始（storage ラッパー自動初期化）。ルートごとに「Read」列のファイルを Read する。

## ルーティングマップ

| $ARGUMENTS キーワード | セクション | Read |
|---|---|---|
| なし / 起動 / 設定 / 利用可能にして | [環境セットアップ](#環境セットアップ) | [selfhost.md](reference/core/selfhost.md) |
| 停止 / down / status / ログ | 環境セットアップ（コマンド実行） | — |
| DS構築 / トークン定義 / テーマ / ダーク / ライト | [デザインシステム構築](#デザインシステム構築) | [mcp-api.md](reference/core/mcp-api.md), [design.md](reference/core/design.md) + フェーズ誘導で該当ファイル |
| コンポーネント / ライブラリ | DS構築（Phase 04-05） | [mcp-api.md](reference/core/mcp-api.md), [design.md](reference/core/design.md), [workflow/phase-04](reference/workflow/phase-04-components.md) or [05](reference/workflow/phase-05-library.md), [library-architecture.md](reference/core/library-architecture.md) |
| デザイン / 画面 / UI / プロトタイプ | [デザイン作成](#デザイン作成) | [mcp-api.md](reference/core/mcp-api.md), [howto/](reference/howto/), [design.md](reference/core/design.md) |
| アプリ作成 / コード生成 / コード変換 | [アプリケーション作成](#アプリケーション作成) | [pipeline/overview.md](reference/pipeline/overview.md), [mcp-api.md](reference/core/mcp-api.md) |
| トークン同期 / DTCG | [外部パイプライン](#外部パイプライン)（01） | [mcp-api.md](reference/core/mcp-api.md), [pipeline/01-token-sync.md](reference/pipeline/01-token-sync.md) |
| SD / CSS変数 / SCSS | 外部パイプライン（02） | [pipeline/02-style-dictionary.md](reference/pipeline/02-style-dictionary.md) |
| Storybook | 外部パイプライン（03） | [pipeline/03-storybook.md](reference/pipeline/03-storybook.md) |
| VRT / Lost Pixel | 外部パイプライン（04） | [pipeline/04-vrt.md](reference/pipeline/04-vrt.md) |
| パイプライン / 外部連携 | 外部パイプライン（全体） | [pipeline/overview.md](reference/pipeline/overview.md) |
| レビュー / デザイン検証 | [デザインレビュー](#デザインレビュー) | [mcp-api.md](reference/core/mcp-api.md), [comments.md](reference/core/comments.md) |
| コメント | [コメント操作](#コメント操作) | [comments.md](reference/core/comments.md) |
| その他 | 引数内容に応じて判断 | — |

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

**実装委譲**: 各フェーズの `execute_code` 操作（storage メソッド含む）は penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。フェーズファイルのコード例はサブエージェントへの指示用。

**スクリプト**: 監査 → `storage.validateDesign()` / トークン → `storage.exportTokensDTCG()` / `await storage.importTokensDTCG()`

---

## デザイン作成

**前提**: MCP接続済み | **参照**: → [design.md](reference/core/design.md)

4フェーズ（理解→設計→**実装**→レビュー）。Phase 1-2 はスキル内、Phase 3 は penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。

**Phase 3 開始ゲート（実装着手前に必ず確認）:**
1. 委譲テンプレート（6項目）を準備したか
2. 自分で `execute_code` を呼ぼうとしていないか — していたら中断、委譲に切り替え

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

**実装委譲**: `getPageContext()` 等の MCP 操作は penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。

**既存アプリ**: CSS からデザイン値抽出 → DS構築でトークン定義 → パイプライン 01-02 でエクスポート → ハードコード値をトークン変数に置換

---

## 外部パイプライン

**前提**: トークン定義済み | **参照**: → [pipeline/overview.md](reference/pipeline/overview.md)

**実装委譲**: トークン同期（Pipeline 01）の `execute_code` 操作は penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。Pipeline 02-04 は bash 操作のため親AI直接実行可。

**判定**: `tokens/` に JSON なし → 01 / `style-dictionary.config.*` なし → 02 / Storybook 未起動 → 03 / 全完了 → 04
該当 Pipeline のファイルを Read し手順に従う。

---

## デザインレビュー

**前提**: MCP接続済み | **参照**: → [comments.md](reference/core/comments.md)

レビュー（エクスポート→チェックリスト評価→指摘登録）は penpot-mcp サブエージェントにレビューモードで委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。

**委譲テンプレート（レビュー用）**:
1. **エージェント定義 Read**: `.claude/agents/penpot-mcp.md`（レビューモード参照）
2. **リファレンス Read**: `.claude/skills/penpot/reference/core/comments.md`（チェックリスト + コメント作成手順）
3. **対象**: ボード名 / ページ名
4. **スコープ**: 全般 or 限定（例:「A11y のみ」「カラーのみ」）、指摘コメント登録の要否
5. **成果物**: チェックリスト評価結果 + 差分報告（+ 登録コメント一覧）

デザイン作成フローの受入レビュー（Phase 4）もこの委譲テンプレートを使用。

---

## コメント操作

**前提**: MCP接続済み | **参照**: → [comments.md](reference/core/comments.md)

コメント CRUD（作成・取得・返信・解決・削除）は `execute_code` を使うため penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）。

**委譲テンプレート（コメント用）**:
1. **エージェント定義 Read**: `.claude/agents/penpot-mcp.md`
2. **リファレンス Read**: `.claude/skills/penpot/reference/core/comments.md`
3. **操作種別と対象**: 作成（ボード名 + 内容）/ 返信・解決（スレッド seqNumber）/ 取得 / 削除
4. **成果物**: 操作結果サマリ

---

## 実装フェーズの開始手順

plan 復帰時、コンテキスト圧縮でスキル知識が消失している可能性あり。**plan Step 1 に `/penpot` スキルリロードを含めること。**

1. `/penpot` でスキルリロード
2. `activate` でセッション開始
3. ルーティングマップの「Read」列を Re-read
4. MCP 操作は penpot-mcp サブエージェントに委譲（→ [委譲戦略](#サブエージェント委譲戦略)）

---

## サブエージェント委譲戦略

MCP execute_code の大量呼び出し（20〜70回）によるコンテキスト消費を防ぐため、実装は `penpot-mcp` サブエージェントに委譲する。

### MCP ツール使用境界（厳守）

| ツール | 親AIが直接呼んでよいか | 用途制限 |
|--------|:---:|------|
| `activate` | ○ | セッション確認・metrics 取得のみ |
| `export_shape` | ○ | 単発の視覚確認のみ |
| `execute_code` | **✕ 禁止** | 常にサブエージェント経由 |
| `penpot_api_info` | **✕** | サブエージェントが必要に応じて使用 |
| `high_level_overview` | **✕** | 同上 |

**違反検知ルール**: `execute_code` を直接呼び出している自分に気づいたら、即座に中断し penpot-mcp に委譲し直す。途中結果は破棄。「あと1回だけ」「簡単な確認だけ」は例外にならない。

**コスト根拠**: execute_code 1回 ≈ 2,000 トークン消費。直接 20回 = 40,000 トークン（コンテキストの 25%）。サブエージェントなら返却サマリ 〜500 トークンで済む。「早い」は錯覚 — コンテキスト枯渇で後半の品質が崩壊する。

**Copilot 互換性注記**: Copilot Agent Mode はサブエージェント境界を技術的に強制しない。ツール使用境界は自己規律として守ること。Copilot で penpot-mcp を使う場合は `@penpot-mcp` でエージェントを明示的に呼び出す。

### サブエージェントへの指示テンプレート

サブエージェントには以下を必ず含めること:
1. **エージェント定義の Read 指示**: `.claude/agents/penpot-mcp.md` を最初に Read
2. **作業スコープ**: metrics 判定に基づき「やること・やらないこと」を明示（例: 「トークン定義済み。画面構築のみ。トークン定義は不要」）
3. **Read する howto**: 要件に合う howto ファイルパスを指定
4. **storage の現在状態**: 既存ボードの ID/名前
5. **具体的な成果物定義**: 何を作り、何を返すか
6. **デザイン仕様**: → [delegation-format.md](reference/core/delegation-format.md) の構造化フォーマットに従う

---

## 補足

- 複合タスクでは `.penpot-task.md` に計画・進捗・キーパスを記録し、コンテキスト圧縮時に Read して復元
- API 制約 → [mcp-api.md「Plugin API 実践的制約」](reference/core/mcp-api.md#plugin-api-実践的制約)
