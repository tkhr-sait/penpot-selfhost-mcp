# GitHub Copilot (VS Code) での Penpot MCP 接続ガイド

GitHub Copilot の Agent Mode から Penpot MCP サーバーに接続し、自然言語で UI デザインを操作するためのガイド。

## 前提条件

- Docker 環境が起動済み（`bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up` 実行済み）
- VS Code + GitHub Copilot 拡張機能がインストール済み
- Copilot のエージェントモード（Agent Mode）が利用可能であること

## MCP 設定ファイル

プロジェクトルートの `.vscode/mcp.json` に MCP サーバー設定が **既に含まれている**:

```json
{
  "servers": {
    "penpot-official": {
      "url": "http://localhost:4411/mcp",
      "type": "http"
    }
  }
}
```

VS Code がこのファイルを認識し、MCP サーバーとして自動的に登録する。追加の設定は不要。

## 環境起動手順

### 1. Docker 環境を起動

```bash
bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up
```

### 2. MCP 自動接続（Playwright headless）

```bash
bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect
```

これにより headless Chromium が Penpot にログインし、MCP プラグインを自動接続する。
**このプロセスは MCP 接続を維持するため、ターミナルで実行したままにしておく**こと。

### 3. VS Code で MCP サーバーを確認

1. コマンドパレットを開く: `Ctrl+Shift+P`（macOS: `Cmd+Shift+P`）
2. `MCP: List Servers` を実行
3. `penpot-official` が一覧に表示されていることを確認
4. サーバーが停止状態の場合は `Start` または `Restart` をクリック

## Copilot Chat での利用方法

### エージェントモードを使用

1. Copilot Chat パネルを開く
2. モードセレクターで **Agent** を選択
3. ツールアイコン（工具マーク）をクリックし、`penpot-official` のツールが有効であることを確認
4. チャットで指示を入力（例: 「Penpot にログインフォームのワイヤーフレームを作成して」）

### 利用可能なツール

| ツール | 用途 |
|--------|------|
| `execute_code` | Penpot Plugin API 環境で JavaScript を実行 |
| `export_shape` | シェイプを PNG/SVG でエクスポート（視覚確認） |
| `penpot_api_info` | API 型定義・メンバー情報を取得 |
| `high_level_overview` | Plugin API の概要を取得 |

## 制約事項

- **tools のみ対応**: MCP の resources / prompts は現時点で Copilot 未対応
- **フォント制約**: エアギャップ構成のため `fontFamily: "sourcesanspro"` のみ利用可能（Google Fonts は未ロード）
- **Playwright セッション維持が必要**: `mcp-connect` プロセスが終了すると MCP 接続が切れる
- **ブラウザ操作との独立性**: MCP は `mcp-copilot@penpot.local` ユーザーで動作するため、`dev@example.com` でのブラウザ操作と干渉しない

### Claude Code との同時接続について

Claude Code と GitHub Copilot はそれぞれ専用の MCP サーバーインスタンス（Claude: ポート4401、Copilot: ポート4411）と専用ユーザーで動作するため、**完全に独立した同時接続が可能**。互いに干渉することはなく、制約なく並行利用できる。

## トラブルシューティング

### MCP サーバーが VS Code に表示されない

- `.vscode/mcp.json` がプロジェクトルートに存在するか確認
- VS Code をリロード（`Ctrl+Shift+P` → `Developer: Reload Window`）

### MCP サーバーに接続できない

1. Docker サービスが起動しているか確認: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status`
2. MCP 自動接続が実行中か確認: `mcp-connect` プロセスが動作していること
3. ポート 4411 が利用可能か確認: `curl http://localhost:4411/mcp`
4. VS Code のコマンドパレットから `MCP: List Servers` → `penpot-official` を Restart

### ツール実行がタイムアウトする

- `mcp-connect` の headless ブラウザセッションが切れている可能性あり
- `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect copilot` を再実行

## 関連ドキュメント

- [セルフホスト環境リファレンス](selfhost.md) — サービス構成、ユーザー、ポート、コマンド
- [MCP API リファレンス](mcp-api.md) — Plugin API、シェイプ操作、レイアウト、ライブラリ
- [デザインワークフロー](design.md) — デザイン原則・カラートークン・タイポグラフィ
- [実装パターン集](penpot-recipes.md) — コード例
