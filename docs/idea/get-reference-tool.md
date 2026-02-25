# get_reference ツール — MCP経由の知識取得API

> Agent Skills vs MCP の配信メカニズム評価から導出された設計提案

## 1. 背景: Agent Skills vs MCP 評価

### 現状のアーキテクチャ

| 層 | 担当 | 実体 |
|---|---|---|
| **Skills** | 知識・判断・ルーティング | SKILL.md, penpot-mcp.md, リファレンス群 |
| **MCP** | 実行・強制・ランタイム | proxy-server.mjs, init scripts, ツール群 |

### Skills（ファイルベース知識配信）: 55点

**良い点:**
- リポジトリ同梱で配布コストゼロ
- LLMの意思決定を直接ガイドできる（フェーズ判定、ルーティング）

**致命的な弱点:**
- **コンテキスト圧縮で消える** — 長セッションで蒸発。復元手順を書いても復元手順自体が圧縮される
- **強制力ゼロ** — 「storageラッパーを優先せよ」と書いてもLLMが無視すれば終わり
- **二重管理が不可避** — `.claude/agents/` と `.github/agents/` にほぼ同一ファイル
- **Claude Code 構文ロックイン** — SKILL.md のルーティングは `/penpot` コマンド前提
- **スケールしない** — リファレンス増加でコンテキスト窓を圧迫

### MCP（プロトコルベース実行配信）: 72点

**良い点:**
- **ランタイム強制力** — proxyのゲートは「activate前はツールブロック」をコードで強制
- **init.d パターン** — 冪等ガード付き番号スクリプトで確実な初期化
- **業界標準化** — Anthropic発、OpenAI・Googleも対応方向
- **プラットフォーム非依存** — Claude Code / Copilot / Cursor 共通

**弱点:**
- **インフラが重い** — LLM → proxy → MCP Server → Plugin → mcp-connect → Backend の6層
- **知識の配信ができていない** — Tools のみ使用、Resources/Prompts 未活用
- **セットアップの敷居が高い** — Docker Compose + セルフホスト + Playwright
- **execute_code 一本足打法** — 型安全性ゼロ

### 統合評価: 45点

Skills と MCP が疎結合すぎて弱点を補完できていない:

```
Skills の弱点「強制力がない」→ MCP のゲートで一部補完 ✓
MCP の弱点「知識配信がない」→ Skills で補完...のはずが圧縮で消える ✗
```

---

## 2. 発見: MCP Resources/Prompts の限界

MCP プロトコルは Tools / Resources / Prompts の3要素を持つ。「Skills の知識を Resources/Prompts に移植すれば解決」と考えたが、**Claude Code のクライアント実装が障壁**。

| MCP機能 | 期待していた動作 | Claude Code での実際の動作 |
|---------|-----------------|--------------------------|
| **Resources** | AIが自律的にフェーズ情報を取得 | ユーザーが `@penpot:ref/mcp-api` と**手打ち**しないと読まれない |
| **Prompts** | AIが自動でルーティングテンプレートを参照 | ユーザーが `/mcp__penpot__...` と**手打ち**しないと発動しない |
| **Tools** | AIが自律的に呼び出す | **これだけAI駆動** |

### 結論

MCP Resources/Prompts に移植しても「AIが自動で読む」問題は解決しない。コンテキスト圧縮で知識が消えたとき、AIが自発的に再取得する手段にならない。

### 修正スコア

| アプローチ | スコア | 理由 |
|-----------|--------|------|
| 現状（Skills + MCP Tools） | 55点 | 圧縮で知識消失、二重管理 |
| MCP Resources/Prompts 移植 | 40点 | user-driven なので問題が悪化する |
| **MCP Tools で知識取得API化** | 78点 | AI-driven、再取得可能、1ソース |

---

## 3. 提案: `get_reference` ツール

### コンセプト

```
現状:  SKILL.md → Read("reference/mcp-api.md") → コンテキストに載る → 圧縮で消える

提案:  get_reference("mcp-api") → 必要時にAIが自発呼び出し → 毎回新鮮に取得
```

proxy-server.mjs に `get_reference` ツールを注入する（`activate` と同じパターン）。

### ツールスキーマ

```json
{
  "name": "get_reference",
  "description": "Penpot スキルのリファレンスドキュメントを取得する。コンテキスト圧縮後の知識復元、または特定トピックの詳細確認に使用。activate の前後どちらでも呼び出し可能。引数なしでトピック一覧を返す。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "トピック名（例: 'mcp-api', 'cookbook/kanban', 'workflow/phase-03-tokens'）。省略でトピック一覧。"
      }
    }
  }
}
```

### 特徴

- **AI-driven**: AI が必要と判断したときに自律的に呼べる
- **ゲート不要**: activate 前でも使用可能（upstream 不要、ローカルファイル読み取りのみ）
- **動的トピック一覧**: ファイルシステムスキャンで reference/ 配下の .md を自動列挙
- **セキュリティ**: `resolve()` + `startsWith()` でパストラバーサルを防止
- **1ソース**: Docker ボリュームマウントで reference/ を配信。ファイルパスのハードコード不要

---

## 4. 実装設計

### 4.1 proxy-server.mjs の変更

**設定変数追加**（L37付近）:

```js
const REFERENCE_DIR = getArg("reference-dir", "") || env("MCP_REFERENCE_DIR", "");
```

**ツール定義追加**（ACTIVATE_TOOL の後）:

```js
const GET_REFERENCE_TOOL = { /* 上記スキーマ */ };
```

**ListTools ハンドラ**（L207付近、ACTIVATE_TOOL push の直後）:

```js
if (REFERENCE_DIR) {
  tools.push(GET_REFERENCE_TOOL);
}
```

**CallTool ハンドラ**（L292 activate の `}` 直後、ゲートチェック前に挿入）:

```js
// --- get_reference (proxy-injected, always available) ---
if (name === "get_reference" && REFERENCE_DIR) {
  const topic = args?.topic;
  if (!topic || topic === "list") {
    const topics = scanTopics(REFERENCE_DIR);
    return { content: [{ type: "text", text: `利用可能なトピック:\n${topics.map(t => `- ${t}`).join("\n")}` }] };
  }
  const filePath = join(REFERENCE_DIR, topic.endsWith(".md") ? topic : topic + ".md");
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(REFERENCE_DIR)) || !existsSync(resolved)) {
    return { content: [{ type: "text", text: `トピック "${topic}" は存在しません。引数なしでトピック一覧を確認してください。` }], isError: true };
  }
  return { content: [{ type: "text", text: readFileSync(resolved, "utf-8") }] };
}
```

**scanTopics ヘルパー**:

```js
function scanTopics(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true });
  const topics = [];
  for (const e of entries) {
    if (e.isDirectory()) topics.push(...scanTopics(join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name));
    else if (e.name.endsWith(".md")) topics.push(prefix ? `${prefix}/${e.name.replace(/\.md$/, "")}` : e.name.replace(/\.md$/, ""));
  }
  return topics.sort();
}
```

### 4.2 docker-compose.yml の変更

```yaml
penpot-proxy:
  volumes:
    - ../mcp-snippets:/app/init-scripts:ro
    - ../../reference:/app/reference:ro          # 追加
  environment:
    # ... 既存 ...
    MCP_REFERENCE_DIR: /app/reference            # 追加
```

### 4.3 SKILL.md のスリム化

| 対象 | 変更 |
|------|------|
| ルーティングマップ（L29-45） | ファイルパス列 → `get_reference` トピック名 |
| フェーズ誘導（L73-79） | ファイルパスリンク → `get_reference topic=workflow/phase-XX` |
| cookbook 選択（L95-99） | 同上 |
| 各セクションの参照リンク | → `get_reference topic=...` |
| サブエージェント委譲テンプレート（L152-153） | Read 指示 → `get_reference` |

**保持**: ツール名規約、フェーズ判定ロジック（metrics 分岐）、環境セットアップ手順、委譲判断基準

**見込み**: 165行 → 約90行（45%削減）

### 4.4 エージェント定義の更新

`.claude/agents/penpot-mcp.md` / `.github/agents/penpot-mcp.agent.md` の初期化手順:

```markdown
### 必須（毎回）
1. `activate` 呼び出し
2. `get_reference topic=mcp-api` で API 制約を取得
3. タスクに応じて追加トピックを取得（`get_reference` 引数なしで一覧確認）
```

### 4.5 インクリメンタル移行パス

1. **Step 1**: proxy + docker-compose の変更（破壊なし、既存フロー無変更で動作）
2. **Step 2**: エージェント定義更新（get_reference 活用形に）
3. **Step 3**: SKILL.md スリム化（Step 1-2 動作確認後）

---

## 5. 自己レビュー: 82点

**強み:**
- 根本原因（コンテキスト圧縮による知識消失）への直接対処
- インクリメンタル移行可能（既存フロー壊さない）
- セキュリティ考慮（パストラバーサル防止）
- プラットフォーム非依存（ツール名で統一）

**残課題:**
- **-5**: AI が「いつ get_reference を呼ぶべきか」は description テキスト依存。activate 返り値に「詳細は get_reference で取得可能」のヒントを含めるとより確実
- **-5**: エージェント定義の二重管理（.claude/agents/ vs .github/agents/）は構造上解消不可
- **-3**: reference ファイルのサイズ大時のレスポンス分割は未対応（現状問題なし）
- **-5**: `scanTopics` は毎回ディスクI/O（呼び出し頻度が低いため初期実装では許容）
