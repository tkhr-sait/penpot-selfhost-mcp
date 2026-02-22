# ADR-003: MCP プロキシによるゲート + 再接続管理

## Status

Accepted

## Context

3 つの問題が発生していた:

1. **スキル未ロードでの MCP 直接呼び出し** — high_level_overview 相当の情報が MCP 起動時に導入されてしまうため、AI が必要十分な知識があると誤認して `/penpot` スキルをロードせずに `execute_code` 等を直接呼び出し、penpot-init.js の初期化やリファレンス読み込みが行われないまま操作を実行してしまう。エラーメッセージだけでは防止できない
2. **上流 MCP 切断時のユーザー操作依存** — 上流 MCP サーバー（penpot-official）が切断した際、ユーザーが手動で `/mcp` → Reconnect を実行する必要がある
3. **Penpot 固有依存の混入** — プロキシのデフォルト値（URL、サーバー名）や Dockerfile に Penpot 固有の設定がハードコードされており、Storybook 等の他 MCP サーバーへの転用時に不要な依存が混入していた。汎用プロキシとしての再利用を阻害

## Decision

stdio プロキシ MCP サーバーを挟み、以下の制御を行う。

### 1. activate ゲート

`activate` ツールを新設し、全ツールの呼び出しをゲート制御する:
- `activate` 呼び出し前: 全ツールがエラーを返し、スキルロードを促す
- `activate` 呼び出し後: ツールが上流に転送される
- `--skill` / `MCP_SKILL` が空の場合はゲート無効（transparent モード）

### 2. auto-init

`activate` 時に `--init-script` で指定された初期化スクリプトを上流で自動実行する。スクリプトは `--init-tool`（デフォルト: `execute_code`）を使って上流に送信される。スキル側のルーティングマップから手動実行手順を削除。

### 3. 再接続管理

上流切断時、AI が `activate` を再呼び出しすることで再接続する。ユーザーの手動操作（`/mcp` → Reconnect）が不要になる。transparent モードでは初回ツール呼び出し時に自動接続し、切断時は自動再接続を 1 回試行する。

### 4. システムプロンプトのスリム化

プロキシの instructions フィールドは短いゲートメッセージのみ。上流の詳細 API ドキュメント（Shape 階層、penpotUtils 等）はシステムプロンプトから除外され、activate 後に `high_level_overview` ツールを呼ぶことで取得可能。

### 5. Penpot 固有依存の排除と設定外部化

プロキシのデフォルト値・Dockerfile から Penpot 固有のパス・ツール名を排除。CLI 引数と環境変数の二段フォールバック（CLI > env > default）を導入。Penpot 固有設定は Docker Compose service preset（`penpot-proxy`）に集約し、init スクリプトは volume mount でコンテナに注入する。`.mcp.json` 等の呼び出し元設定は upstream URL のみに最小化。

### 6. Eager Schema Fetch

`tools/list` リクエスト時にベストエフォートで上流スキーマを取得する。上流未起動時はフォールバック定義（ツール名のみ、inputSchema なし）を使用。これにより activate 前でも IDE にリアルなスキーマを提供できる。

### 7. `sendToolListChanged` による動的スキーマ更新

`activate` 成功後に `sendToolListChanged` を送信し、Claude Code にリアルスキーマを通知する。Eager Schema Fetch が成功していなかった場合でも、activate 後にフォールバック定義からリアルスキーマへの切り替えが行われる。

## Architecture

プロキシは CLI 引数と環境変数により汎用化されており、複数の上流 MCP サーバーに対応する。

### CLI 引数 + 環境変数マッピング

| 引数 | 環境変数 | デフォルト | 説明 |
|------|----------|-----------|------|
| `--upstream` | `MCP_UPSTREAM` | （必須） | 上流 MCP サーバー URL |
| `--name` | `MCP_NAME` | `mcp-proxy` | サーバー識別名 |
| `--skill` | `MCP_SKILL` | （空） | スキル名（空でないとゲート有効化） |
| `--tools` | `MCP_TOOLS` | `*` | 公開ツール（カンマ区切り、`*` で全転送） |
| `--init-script` | `MCP_INIT_SCRIPT` | （なし） | 初期化スクリプトパス |
| `--init-tool` | `MCP_INIT_TOOL` | `execute_code` | 初期化に使用する上流ツール名 |
| `--no-init` | `MCP_NO_INIT` | `false` | 初期化スキップ |

優先順位: CLI 引数 > 環境変数 > デフォルト値。`--upstream` はデフォルトなしの必須引数。

### Service Preset 構成

```
proxy (base)        → 上流に直接転送。ゲートなし、init なし。最小構成
penpot-proxy        → gate + auto-init を opt-in（Penpot 固有設定を環境変数で注入）
storybook-proxy     → transparent（gate なし）。名前のみ設定
```

### 設定配置

```
docker-compose.yml  → service preset（環境変数 + volume mount で Penpot 固有設定を集約）
.mcp.json 等        → environment-specific な upstream URL のみ
```

`.mcp.json` の例:
```json
{
  "penpot-official": {
    "command": "docker",
    "args": ["compose", "-f", "...docker-compose.yml", "run", "--rm", "-T",
             "penpot-proxy", "--upstream=http://localhost:4401/mcp"]
  }
}
```

### Penpot 接続

```
AI → (stdio) → [Docker] Proxy MCP → (HTTP/SSE) → penpot-official MCP (localhost:4401)
                        │
                        │  docker-compose.yml: penpot-proxy preset
                        │    MCP_NAME=penpot-official
                        │    MCP_SKILL=/penpot
                        │    MCP_TOOLS=execute_code,export_shape,penpot_api_info,high_level_overview
                        │    MCP_INIT_SCRIPT=/app/init-scripts/penpot-init.js (volume mount)
                        │
                        ├── activate            ← ゲート解除 + auto-init + 上流接続/再接続
                        ├── execute_code        ← unlocked 時のみ転送
                        ├── export_shape        ← unlocked 時のみ転送
                        ├── penpot_api_info     ← unlocked 時のみ転送
                        └── high_level_overview ← unlocked 時のみ転送
```

### Storybook 接続

```
AI → (stdio) → [Docker] Proxy MCP → (HTTP/SSE) → storybook-mcp (localhost:6007)
                        │
                        │  docker-compose.yml: storybook-proxy preset
                        │    MCP_NAME=storybook-mcp
                        │    MCP_SKILL=(空) → transparent モード
                        │
                        └── *（全ツール）       ← 初回呼び出し時に自動接続、ゲートなし
```

### デプロイ

プロキシは Docker コンテナとして起動する。`mcp-proxy/docker-compose.yml`（独立した compose ファイル）を使い、`docker compose run --rm -T <preset>` で stdio MCP サーバーとして実行。初回はイメージを自動ビルドする。

- **infra 非依存**: penpot-selfhost の docker-compose.yml とは独立。プロキシ単体で起動可能
- **`network_mode: host`**: ホストの localhost 経由で上流 MCP に接続（ポートマッピング不要）
- **build context `.`**: proxy-server.mjs と package.json のみをコピー。Penpot 固有ファイルを含まない
- **volume mount**: init スクリプトはホスト側のパスからコンテナにマウント。イメージ再ビルド不要
- **`.mcp.json` / `.vscode/mcp.json`**: `docker compose run` コマンドに `--upstream=URL` のみ指定

### 状態遷移

**Gate モード**（`--skill` 指定時）:

```
起動 → [locked, disconnected]
         ↓ activate 呼び出し
       [unlocked, connected]  ← 正常状態
         ↓ 上流切断検知
       [unlocked, disconnected]
         ↓ ツール呼び出し
       エラー: "上流MCP切断。activate を再度呼んでください"
         ↓ activate 再呼び出し
       [unlocked, connected]  ← 復旧
```

**Transparent モード**（`--skill` 未指定時）:

```
起動 → [unlocked, disconnected]
         ↓ 任意のツール呼び出し
       [unlocked, connected]  ← 自動接続
         ↓ 上流切断検知
       自動再接続を1回試行
         ↓ 成功 → [unlocked, connected]
         ↓ 失敗 → エラー: "自動再接続失敗。上流サービスの状態を確認してください"
```

## Key Choices

1. **全ツールを一貫したゲート方式で公開** — 特定ツールだけでなく全ツールを activate ゲート配下に置く。ゲートはセキュリティ機構ではなく、スキルロードの確認
2. **システムプロンプトから詳細 API ドキュメントを除外** — high_level_overview はゲート付きツールとして提供。スキル未ロード時に AI が詳細 API 知識を持たない設計
3. **penpot-init.js の auto-init** — activate で自動実行し、手動の初期化忘れを排除。init スクリプトは volume mount による外部注入で、イメージ再ビルド不要
4. **activate が冪等** — 初回ゲート解除、再接続、再初期化のすべてを 1 つのツールで制御。再呼び出し時は `sendToolListChanged` を送信
5. **Docker コンテナ化 + infra 非依存** — penpot-selfhost の docker-compose.yml には依存せず、独立した compose ファイルで起動。`docker compose run` による自動ビルド + stdio 接続
6. **CLI 引数 + 環境変数の二段フォールバック** — CLI > env > default の優先順位。`--upstream` はデフォルトなしの必須引数とし、誤接続を防止。Penpot 固有のデフォルト値をプロキシ本体から排除
7. **Docker Compose service preset による設定集約** — Penpot 固有設定（サーバー名、スキル名、ツールリスト、init スクリプト）を docker-compose.yml の named service（`penpot-proxy`, `storybook-proxy`）に集約し、呼び出し元 `.mcp.json` は upstream URL のみ指定

## Consequences

### Positive

- スキルロードが事実上必須になり、初期化忘れが物理的にブロックされる
- 再接続がユーザー操作不要になる（AI が activate を再呼び出し）
- システムプロンプトから大量の API ドキュメントが除外され、コンテキスト効率が向上
- プロキシ本体は完全に汎用。新しい MCP サーバー追加は compose preset + upstream URL のみ
- `.mcp.json` の差分は upstream URL のみで、設定の見通しが向上
- init スクリプトの変更はイメージ再ビルド不要（volume mount）

### Negative

- Docker コンテナが追加される（ただし `network_mode: host` で軽量、初回のみビルド）
- スキルロードは依然として必須（エラーメッセージで促す方式は変わらない）
- `--upstream` 必須化により、引数なし起動は動作しなくなる（意図的な破壊的変更）

### Neutral

- 画像データ（ImageContent）はプロキシが callTool 結果をそのまま返すため、特別な処理は不要
- Eager Schema Fetch は上流未起動時にサイレントに失敗し、フォールバック定義にフォールバックする（エラーにはならない）

## Related Files

| ファイル | 説明 |
|---|---|
| [`.claude/skills/penpot/scripts/mcp-proxy/proxy-server.mjs`](../../.claude/skills/penpot/scripts/mcp-proxy/proxy-server.mjs) | プロキシ本体（~330 行） |
| [`.claude/skills/penpot/scripts/mcp-proxy/Dockerfile`](../../.claude/skills/penpot/scripts/mcp-proxy/Dockerfile) | 汎用 Docker イメージ定義 |
| [`.claude/skills/penpot/scripts/mcp-proxy/docker-compose.yml`](../../.claude/skills/penpot/scripts/mcp-proxy/docker-compose.yml) | service preset（proxy / penpot-proxy / storybook-proxy） |
| [`.mcp.json`](../../.mcp.json) | Claude Code 用 MCP 設定（upstream URL のみ） |
| [`.vscode/mcp.json`](../../.vscode/mcp.json) | VS Code / GitHub Copilot 用 MCP 設定（upstream URL のみ） |
