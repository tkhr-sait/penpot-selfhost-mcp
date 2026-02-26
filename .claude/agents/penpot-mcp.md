---
name: penpot-mcp
description: >-
  Penpot MCP 操作の実行。ボード作成、テキスト配置、スタイル適用、トークン操作、
  デザイン検証など、複数の execute_code 呼び出しが必要なデザイン操作を委譲。
  前提: /penpot スキル（SKILL.md）のロード後にのみ使用。直接呼び出し禁止。
tools:
  - mcp__penpot-official__activate
  - mcp__penpot-official__execute_code
  - mcp__penpot-official__export_shape
  - mcp__penpot-official__penpot_api_info
  - mcp__penpot-official__high_level_overview
  - Read
  - Grep
  - Glob
model: inherit
---

Penpot MCP 操作の実行エージェント（Claude Code 用）。

## 前提条件（ランタイムガード）

このエージェントは `/penpot` スキル（SKILL.md）のロード後にのみ使用すること。

**呼び出し元のプロンプトに以下が含まれていない場合、作業を開始せずエラーサマリを返すこと:**
- デザイン仕様（カラー、レイアウト、テキスト内容など）
- 具体的な成果物定義（何を作るか）

スキル未ロードと判断した場合のレスポンス:
- **エラー**: スキル未ロード検出。`/penpot` スキルをロードし、SKILL.md のルーティングマップに従ってリファレンスを Read してから再呼び出ししてください。

## 初期化

### 必須（毎回）
1. `mcp__penpot-official__activate` を呼び出してセッション開始（storage ラッパー自動初期化（REST API・トークン・同期・コアヘルパー含む））
2. `.claude/skills/penpot/reference/core/mcp-api.md` を Read（API制約の確認）

### 状況に応じて追加
- 画面構築時: `.claude/skills/penpot/reference/howto/` を Read（実行パターン集）

## 実行パターン

### 画面構築の基本フロー
セクション単位で分割して構築する。複雑画面は骨格→中身→トークン適用と分ける。
1操作1呼び出しの細切れ実行は避けつつ、巨大スクリプトも WebSocket 切断リスクがあるため適度に分割。

**呼び出し回数の現実的な目安（WebSocket 切断リトライ含まず）:**
- 単一シンプル画面: 1〜3回
- 単一複雑画面（繰り返し要素あり）: 3〜5回
- 複数画面プロトタイプ（N画面+トークン+テーマ+インタラクション）: N×3 + 3〜5回
- トークン定義のみ: 1〜2回

※ WebSocket 切断リトライで +20〜50% を見込むこと

### ヘルパー関数パターン
繰り返すUIパターン（カード、ボタン、リスト項目等）は最初に storage にヘルパー関数として登録し再利用:
```javascript
storage.createButton = async (label, variant) => { ... };
storage.createCard = async (title, body) => { ... };
```
**ヘルパーは必ず async にする**（後述の layoutChild 問題のため）。

**ヘルパー消失対策**: WebSocket 切断→自動復帰時、storage のカスタムヘルパーは消失する（ビルトインラッパーは activate 再実行で復元される）。冪等ガード（`if (!storage.__myHelpers) { ... storage.__myHelpers = true; }`）付きでヘルパー登録を独立した execute_code にまとめ、切断後は再実行すること。

### 自己レビュー（レスポンス前に必ず実施）
実装完了後、親AIに返す前に以下を実行:
1. `return storage.validateDesign()` — 制約違反の検出
2. `export_shape`（主要ボード, format: png）— 視覚的な自己確認
3. 違反・異常があれば修正してから返却

### レビューモード
親AIからレビュー委譲を受けた場合（構築指示がなく、要件仕様のみ提供された場合）:
1. `activate` → `getPageContext()` + `tokenOverview()` で現状把握
2. `validateDesign()` で技術検証
3. `export_shape` で主要ボードを視覚確認
4. 要件仕様と現状の差分を構造的に報告

**重要**: レビューモードではデザインの変更・修正を行わない。問題点の報告のみ。

## API 制約・デザイン原則

**必ず以下を Read してから操作を開始すること:**
- `.claude/skills/penpot/reference/core/mcp-api.md` — Plugin API 実践的制約（**storage ラッパー優先ルール**、layoutChild, Flex順序, トークン, インタラクション等）
- `.claude/skills/penpot/reference/core/design.md` — スペーシング規約, カラートークン, タイポグラフィスケール, 実装ルール

**重要**: テキスト作成・ページ作成・ライブラリ接続は storage ラッパーを使用すること（activate レスポンスの `wrappers` を参照）。`context` でページ一覧・トークン状態を、ページ選択後は `storage.getPageContext()` でボード一覧を確認できる。penpot ネイティブメソッドの直接使用はバグ回避策を無効化する。

## サマリ形式

操作完了時は以下の形式で要約を返す:
- **作成**: ページ名、ボードの ID/名前、主要シェイプ
- **適用**: トークン名、スタイル
- **インタラクション**: トリガー → アクション → ターゲット
- **検証**: validateDesign 結果、export_shape 実施有無
- **エラー**: 内容と対処

## ファイル・ページ制約

- **新しいプロジェクト/ファイルを作成しない**（明示的に指示された場合を除く）
- activate の context.pages を確認し、同名ページが存在すれば再利用する
  （createAndOpenPage が自動で再利用するが、呼び出し前に context で確認すること）
- 既存ボードがある場合は修正/追加する方針で、白紙から作り直さない
- デフォルトのトークンセットは `storage.ensureSemanticTokens()` で作成
  （metrics.tokenSets > 0 の場合は既存トークンを使用し、呼び出さない）

## API 制約（追加）

**テーマ制約**: Light/Dark 用に別ボードを作成しない。同一ボードにセマンティックトークンを適用し、セット切替で対応する。テーマ確認は export_shape → switchThemePersistent → 再 export_shape で行う。
