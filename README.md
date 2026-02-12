# penpot-selfhost-mcp

![Claude CodeからPenpotにUIデザインを作成しているスクリーンショット](docs/images/top.png)

[Penpot](https://penpot.app/) セルフホスト環境 + MCP サーバーのオールインワン Docker Compose 構成。
AI エージェント（Claude Code / GitHub Copilot）に自然言語で話しかけるだけで、Penpot 上に UI デザインを作成できる。

## 仕組み — Agent Skills

このプロジェクトの中核は **[Agent Skills](https://agentskills.io/)** である。
Agent Skills は AI エージェントに専門的な知識とワークフローを与えるための軽量なオープンフォーマットで、Claude Code、GitHub Copilot (VS Code)、Cursor など多くの AI ツールが対応している。

本リポジトリは Penpot セルフホスト環境（Docker Compose）、MCP サーバー、自動接続スクリプトといったインフラ一式を含むが、それらを束ねて AI エージェントに使わせているのが `.claude/skills/penpot/` に配置された **スキル定義** である。スキルがドメイン知識・手順・スクリプトをパッケージ化し、AI エージェントの振る舞いを決定する。

```
.claude/skills/penpot/
├── SKILL.md                        # スキル定義（エントリーポイント）
├── reference/                      # AI が参照するナレッジベース
│   ├── design.md                   #   デザインワークフロー・原則
│   ├── mcp-api.md                  #   MCP / Plugin API リファレンス
│   ├── selfhost.md                 #   セルフホスト環境の構成情報
│   └── ...
└── scripts/                        # AI が実行するスクリプト群
    ├── penpot-selfhost/            #   Docker 環境管理・MCP 自動接続
    └── mcp-snippets/               #   デザインユーティリティ・検証
```

ユーザーが「**penpotで〜**」と話しかけると、以下が自動的に行われる:

1. **スキル起動** — `SKILL.md` がロードされ、AI エージェントにドメイン知識と手順が注入される
2. **環境構築** — Docker Compose で Penpot + MCP サーバーを起動
3. **MCP 接続** — Playwright による自動ブラウザ操作で Penpot Plugin 経由の MCP 接続を確立
4. **デザイン作成** — MCP 経由の Plugin API でシェイプ・レイアウト・インタラクションを構築
5. **検証** — デザイン制約の自動チェックとビジュアル確認

スキルが AI エージェントの「手順書」として機能し、**インフラ構築からデザイン作成までをエンドツーエンドで自律実行する**仕組みになっている。

## 準備

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/ja-jp/)（または [podman](https://podman.io/)。podman の場合は `dev.containers.dockerPath` を `podman` に設定）
- VS Code 拡張機能 [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## クイックスタート

1. リポジトリを VS Code で開き、コマンドパレット（`F1`）→ **Dev Containers: Reopen in Container** を選択
2. AI エージェントに「penpotで〜」と依頼すると、環境の起動から MCP 接続まで自動で行われる
3. 起動後 http://localhost:9001 にアクセス（デフォルト: `dev@example.com` / `devdev123`）

> コマンドパレット（`F1`）→ **Browser: Open Integrated Browser** で VS Code 内ブラウザが使える

### プロンプト例

> **penpotでTODOアプリケーションのプロトタイプをインタラクション付きで作成して**
>
> **penpotでレビューして結果をコメント登録して**
>
> **penpotでコメント確認し修正して。修正内容をコメントで返して**
>
> **penpotで作成したTODOアプリケーションのプロトタイプをもとに、アプリケーションを作成して**
>
> **penpotにユーザ追加して。test@example.com**

手動で環境を管理する場合は [SKILL.md](.claude/skills/penpot/SKILL.md) を参照。

## 対応AIツール

| ツール                   | MCP設定ファイル    | 備考                              |
| ------------------------ | ------------------ | --------------------------------- |
| Claude Code(CLI)         | `.mcp.json`        | `npx mcp-remote` 経由で HTTP 接続 |
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | ネイティブ HTTP 対応              |

> Claude Code の [VS Code extension](https://code.claude.com/docs/en/vs-code#vs-code-extension-vs-claude-code-cli) を使う場合は `/penpot` でスキルを明示的に起動する必要がある。

## アーキテクチャ

![penpot-selfhost-mcpのアーキテクチャ図](docs/images/arch.png)

MCP サーバーは [Penpot 公式リポジトリ](https://github.com/penpot/penpot/tree/develop/mcp) の `mcp/` ディレクトリからソースをビルドしている。
詳細は [SKILL.md](.claude/skills/penpot/SKILL.md) を参照。

## License

MIT
