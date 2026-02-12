# Penpot セルフホスト環境リファレンス

Docker Compose によるセルフホスト構成、ユーザー管理、MCP接続、管理コマンドの詳細。

## サービス構成

| サービス | 役割 | デフォルトポート |
|---|---|---|
| penpot-frontend | Nginx UI | 9001 |
| penpot-backend | Clojure API | (internal) |
| penpot-exporter | Export 処理 | (internal) |
| penpot-postgres | PostgreSQL | (internal) |
| penpot-valkey | Redis 互換 KVS | (internal) |
| penpot-mcp-claude | MCP Plugin Server (Claude Code用) | 4400, 4401, 4402 |
| penpot-mcp-copilot | MCP Plugin Server (Copilot用) | 4410, 4411, 4412 |

### ポート構成

| ポート | 用途 | 環境変数 |
|--------|------|----------|
| 9001 | Penpot Web UI | `PENPOT_PORT` |
| 4400 | プラグイン静的ファイル配信 (Claude) | `PENPOT_MCP_CLAUDE_PLUGIN_PORT` |
| 4401 | MCP HTTP/SSE エンドポイント (Claude) | `PENPOT_MCP_CLAUDE_HTTP_PORT` |
| 4402 | WebSocket (Claude) | `PENPOT_MCP_CLAUDE_WS_PORT` |
| 4410 | プラグイン静的ファイル配信 (Copilot) | `PENPOT_MCP_COPILOT_PLUGIN_PORT` |
| 4411 | MCP HTTP/SSE エンドポイント (Copilot) | `PENPOT_MCP_COPILOT_HTTP_PORT` |
| 4412 | WebSocket (Copilot) | `PENPOT_MCP_COPILOT_WS_PORT` |

## ユーザーアカウント構成

起動時に3つのユーザーが自動作成される:

| ユーザー | 表示名 | メール | パスワード | 用途 |
|---|---|---|---|---|
| 一般ユーザー | `Developer` | `dev@example.com` | `devdev123` | ブラウザでの手動操作・デザイン作業 |
| Claude Code用 | `Claude Code(MCP)` | `mcp-claude@penpot.local` | `mcpclaude123` | Claude Code MCP 自動接続 |
| Copilot用 | `GitHub Copilot(MCP)` | `mcp-copilot@penpot.local` | `mcpcopilot123` | GitHub Copilot MCP 自動接続 |

- 各MCP専用ユーザーには起動時にデフォルトプロジェクト・ファイル（`MCP Workspace`）が自動作成される
- 環境変数 `PENPOT_MCP_CLAUDE_EMAIL` / `PENPOT_MCP_COPILOT_EMAIL` 等でカスタマイズ可能
- 一般ユーザーは `PENPOT_DEFAULT_EMAIL` / `PENPOT_DEFAULT_PASSWORD` でカスタマイズ可能
- **MCP経由のデザイン操作は各MCP専用ユーザーの権限で実行される**（一般ユーザーのセッションとは独立）

### ユーザー追加

管理スクリプトの `create-profile` コマンドで追加できる:

```bash
bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh create-profile "<email>" "<表示名>" "<password>"
```

追加後、オンボーディングスキップと共有チームへの追加を行う:

```bash
# オンボーディングをスキップ
docker exec -i penpot-penpot-postgres-1 psql -U penpot -d penpot -c \
  "UPDATE profile SET props = props || '{\"~:viewed-tutorial?\": true, \"~:viewed-walkthrough?\": true, \"~:onboarding-viewed\": true}'::jsonb WHERE email = '<email>';"

# 共有チーム (Shared Workspace) に追加
docker exec -i penpot-penpot-postgres-1 psql -U penpot -d penpot -c "
  INSERT INTO team_profile_rel (team_id, profile_id, is_owner, is_admin, can_edit)
  SELECT t.id, p.id, true, true, true
  FROM profile p, team t
  WHERE p.email = '<email>'
    AND t.name = 'Shared Workspace'
    AND t.is_default = false
    AND NOT EXISTS (
      SELECT 1 FROM team_profile_rel r
      WHERE r.team_id = t.id AND r.profile_id = p.id
    );"
```

> 起動時に自動作成される3ユーザーはこれらの処理が自動で行われるため、手動操作は不要。

## MCP サーバー: Official Penpot MCP (Plugin-Based)

- **方式**: ブラウザの Penpot Plugin 経由で WebSocket 接続
- **特徴**: Plugin API のフルアクセス、動的コード実行、階層構造・レイアウト制御可能
- **制約**: headless Chromium (Playwright) セッションを維持する必要あり（mcp-connect が維持）
- **並行運用**: Claude Code と Copilot はそれぞれ独立したMCPインスタンスで動作し、同時接続が可能

## 管理コマンド一覧

```
bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh <command>

up                    全サービス起動（初回は自動ビルド）
down                  全サービス停止
restart               再起動
status                稼働状況と MCP 接続情報
logs [service]        ログ表示
mcp-connect [claude|copilot|all]  Playwright headless MCP 自動接続
build                 MCP サーバーイメージ再ビルド
setup [email] [pw]    ユーザー作成
backup [dir]          DB・アセットのバックアップ
restore <db> [assets] バックアップから復元
update [version]      バージョン更新
```

## 手動プラグイン接続（フォールバック）

mcp-connect が使えない場合の手動手順（**MCP専用ユーザーでログイン**すること）:

### Claude Code 用
1. Penpot をブラウザで開く (`http://localhost:9001`)
2. `mcp-claude@penpot.local` / `mcpclaude123` でログイン
3. メインメニュー → Plugins → Plugin Manager
4. プラグイン URL 入力: `http://localhost:4400/manifest.json`
5. Install → プラグインパネルを開く
6. "Connect to MCP server" をクリック
7. **ブラウザタブを開いたまま** Claude Code で操作

### Copilot 用
1. Penpot をブラウザで開く (`http://localhost:9001`)
2. `mcp-copilot@penpot.local` / `mcpcopilot123` でログイン
3. メインメニュー → Plugins → Plugin Manager
4. プラグイン URL 入力: `http://localhost:4410/manifest.json`
5. Install → プラグインパネルを開く
6. "Connect to MCP server" をクリック
7. **ブラウザタブを開いたまま** VS Code Copilot で操作

> 一般ユーザー (`dev@example.com`) でのブラウザ操作はMCP接続と独立して行える

## 環境変数一覧

環境変数テンプレート: [scripts/penpot-selfhost/.env.example](../scripts/penpot-selfhost/.env.example)

### Core
| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PENPOT_VERSION` | `latest` | Docker イメージタグ |
| `PENPOT_PUBLIC_URI` | `http://localhost:9001` | 公開URL |
| `PENPOT_SECRET_KEY` | `change-this-insecure-key` | セッション署名キー |
| `PENPOT_PORT` | `9001` | フロントエンドポート |
| `PENPOT_DB_PASSWORD` | `penpot` | PostgreSQL パスワード |

### ユーザー
| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PENPOT_DEFAULT_EMAIL` | `dev@example.com` | 一般ユーザーメール |
| `PENPOT_DEFAULT_PASSWORD` | `devdev123` | 一般ユーザーパスワード |

### MCP — Claude Code
| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PENPOT_MCP_CLAUDE_EMAIL` | `mcp-claude@penpot.local` | Claude用ユーザーメール |
| `PENPOT_MCP_CLAUDE_PASSWORD` | `mcpclaude123` | Claude用ユーザーパスワード |
| `PENPOT_MCP_CLAUDE_PLUGIN_PORT` | `4400` | プラグイン静的ファイルポート |
| `PENPOT_MCP_CLAUDE_HTTP_PORT` | `4401` | MCP HTTP/SSE ポート |
| `PENPOT_MCP_CLAUDE_WS_PORT` | `4402` | WebSocket ポート |
| `PENPOT_MCP_CLAUDE_LOG_LEVEL` | `info` | ログレベル |

### MCP — GitHub Copilot
| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PENPOT_MCP_COPILOT_EMAIL` | `mcp-copilot@penpot.local` | Copilot用ユーザーメール |
| `PENPOT_MCP_COPILOT_PASSWORD` | `mcpcopilot123` | Copilot用ユーザーパスワード |
| `PENPOT_MCP_COPILOT_PLUGIN_PORT` | `4410` | プラグイン静的ファイルポート |
| `PENPOT_MCP_COPILOT_HTTP_PORT` | `4411` | MCP HTTP/SSE ポート |
| `PENPOT_MCP_COPILOT_WS_PORT` | `4412` | WebSocket ポート |
| `PENPOT_MCP_COPILOT_LOG_LEVEL` | `info` | ログレベル |

## Docker 構成の特徴

- `enable-air-gapped-conf`: Google Fonts 等の外部通信無効
- `disable-email-verification`: メール確認スキップ
- `disable-onboarding`: オンボーディングスキップ
- `enable-prepl-server`: PREPL サーバー有効
- PostgreSQL 15 + Valkey 8.1 (Redis互換)
- Named volumes: `penpot_postgres_v15`, `penpot_assets`

## リモートアクセス設定

Penpot サーバー（Docker）と MCP クライアント（Claude Code 等）が異なるマシン上にある場合。
Playwright はサーバー側で実行する（プラグインの WebSocket 通信が localhost で完結するため）。

### セットアップ

**サーバー側**（通常どおり起動）:
1. `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up`
2. `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect`（バックグラウンド実行）

**クライアント側**（MCP 接続先をサーバーIPに変更）:

Claude Code — `.mcp.json` の `localhost` をサーバーIPに変更:
```json
{
  "mcpServers": {
    "penpot-official": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://<サーバーIP>:4401/mcp", "--allow-http"]
    }
  }
}
```

GitHub Copilot (VS Code) — `.vscode/mcp.json` の `localhost` をサーバーIPに変更:
```json
{
  "servers": {
    "penpot-official": {
      "url": "http://<サーバーIP>:4411/mcp",
      "type": "http"
    }
  }
}
```

### ネットワーク要件

- クライアント → サーバーのポート **4401** (Claude Code) / **4411** (Copilot) が開放されていること
- ブラウザで Penpot UI にアクセスする場合は **9001** も必要
- Docker のポートマッピングがデフォルト（`0.0.0.0` バインド）であること。
  `127.0.0.1:4401:4401` のように制限している場合はリモートから到達できない

### 運用上の注意

- `penpot-manage.sh` はサーバー側でのみ使用（Docker 操作が前提）
- コメント確認・返信などの運用操作は MCP 経由で行う（`storage.getFileComments`）
