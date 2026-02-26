# GitHub Copilot (VS Code) での利用

Penpot MCP は GitHub Copilot の Agent Mode から利用できる。
環境のセットアップは [README](../../../../README.md) のクイックスタートを参照。

## MCP 接続の確認

1. コマンドパレット: `Ctrl+Shift+P`（macOS: `Cmd+Shift+P`）
2. `MCP: List Servers` を実行
3. `penpot-official` が一覧に表示されていることを確認
4. サーバーが停止状態の場合は `Start` または `Restart` をクリック

## Copilot Chat での利用

1. Copilot Chat パネルを開く
2. モードセレクターで **Agent** を選択
3. ツールアイコン（工具マーク）をクリックし、`penpot-official` のツールが有効であることを確認
4. チャットで指示を入力（例: 「Penpot にログインフォームのワイヤーフレームを作成して」）

## トラブルシューティング

### MCP サーバーが VS Code に表示されない

- `.vscode/mcp.json` がプロジェクトルートに存在するか確認
- VS Code をリロード（`Ctrl+Shift+P` → `Developer: Reload Window`）

### MCP サーバーに接続できない

1. Docker サービスが起動しているか: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh status`
2. MCP 自動接続が実行中か: `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect copilot`
3. ポート 4411 が応答するか: `curl http://localhost:4411/mcp`
4. VS Code: `MCP: List Servers` → `penpot-official` を Restart

### ツール実行がタイムアウトする

- `mcp-connect` のセッションが切れている可能性
- `bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh mcp-connect copilot` を再実行
