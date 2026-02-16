# ADR-003: MCP プロキシによるゲート + 再接続管理

## Status

Accepted

## Context

2 つの問題が発生していた:

1. **スキル未ロードでの MCP 直接呼び出し** — high_level_overview相当の情報がmcp起動時に導入されてしまうため、AI が必要十分な知識があると誤認して `/penpot` スキルをロードせずに `execute_code` 等を直接呼び出し、penpot-init.js の初期化やリファレンス読み込みが行われないまま操作を実行してしまう。エラーメッセージだけでは防止できない
2. **上流 MCP 切断時のユーザー操作依存** — 上流 MCP サーバー（penpot-official）が切断した際、ユーザーが手動で `/mcp` → Reconnect を実行する必要がある

## Decision

stdio プロキシ MCP サーバーを挟み、以下の制御を行う。

### 1. activate ゲート

`activate` ツールを新設し、全ツールの呼び出しをゲート制御する:
- `activate` 呼び出し前: 全ツールがエラーを返し、スキルロードを促す
- `activate` 呼び出し後: ツールが上流に転送される

### 2. auto-init

`activate` 時に penpot-init.js を上流で自動実行する。スキル側のルーティングマップから penpot-init.js の手動実行手順を削除。

### 3. 再接続管理

上流切断時、AI が `activate` を再呼び出しすることで再接続する。ユーザーの手動操作（`/mcp` → Reconnect）が不要になる。

### 4. システムプロンプトのスリム化

プロキシの instructions フィールドは短いゲートメッセージのみ。上流の詳細 API ドキュメント（Shape 階層、penpotUtils 等）はシステムプロンプトから除外され、activate 後に `high_level_overview` ツールを呼ぶことで取得可能。

## Architecture

```
AI → (stdio) → [Docker] Proxy MCP → (HTTP/SSE) → penpot-official MCP (localhost:4401)
                          │
                          ├── activate           ← ゲート解除 + auto-init + 上流接続/再接続
                          ├── execute_code       ← unlocked 時のみ転送
                          ├── export_shape       ← unlocked 時のみ転送
                          ├── penpot_api_info    ← unlocked 時のみ転送
                          └── high_level_overview← unlocked 時のみ転送
```

### デプロイ

プロキシは Docker コンテナとして起動する。`mcp-proxy/docker-compose.yml`（独立した compose ファイル）を使い、
`docker compose run --rm -T proxy` で stdio MCP サーバーとして実行。初回はイメージを自動ビルドする。

- **infra 非依存**: penpot-selfhost の docker-compose.yml とは独立。プロキシ単体で起動可能
- **`network_mode: host`**: ホストの localhost 経由で上流 MCP に接続（ポートマッピング不要）
- **`.mcp.json` / `.vscode/mcp.json`**: `docker compose run` コマンドを直接指定

### 状態遷移

```
起動 → [locked, disconnected]
         ↓ activate 呼び出し
       [unlocked, connected]  ← 正常状態
         ↓ 上流切断検知
       [unlocked, disconnected]
         ↓ execute_code 呼び出し
       エラー: "上流MCP切断。activate を再度呼んでください"
         ↓ activate 再呼び出し
       [unlocked, connected]  ← 復旧
```

## Key Choices

1. **全ツールを一貫したゲート方式で公開** — 特定ツールだけでなく全ツールを activate ゲート配下に置く
2. **システムプロンプトから詳細 API ドキュメントを除外** — high_level_overview はゲート付きツールとして提供。スキル未ロード時に AI が詳細 API 知識を持たない設計
3. **penpot-init.js の auto-init** — activate で自動実行し、手動の初期化忘れを排除
4. **activate が冪等** — 初回ゲート解除、再接続、再初期化のすべてを1つのツールで制御
5. **Docker コンテナ化 + infra 非依存** — penpot-selfhost の docker-compose.yml には依存せず、独立した compose ファイルで起動。`docker compose run` による自動ビルド + stdio 接続

## Consequences

### Positive

- スキルロードが事実上必須になり、初期化忘れが物理的にブロックされる
- 再接続がユーザー操作不要になる（AI が activate を再呼び出し）
- システムプロンプトから大量の API ドキュメントが除外され、コンテキスト効率が向上
- プロキシは約 150 行で壊れにくい

### Negative

- Docker コンテナが追加される（ただし `network_mode: host` で軽量、初回のみビルド）
- スキルロードは依然として必須（エラーメッセージで促す方式は変わらない）

### Neutral

- 画像データ（ImageContent）はプロキシが callTool 結果をそのまま返すため、特別な処理は不要
