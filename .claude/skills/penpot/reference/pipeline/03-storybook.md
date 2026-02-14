# Pipeline 03: Storybook

コンポーネント開発・カタログ・ドキュメント。

## Docker サービス

Penpot 公式イメージ `penpotapp/storybook` が docker-compose.yml に含まれている:

| サービス | ポート | 用途 |
|----------|--------|------|
| penpot-storybook | 6006 | Penpot Design System Storybook |

```bash
# 起動（他サービスと一緒に）
bash .claude/skills/penpot/scripts/penpot-selfhost/penpot-manage.sh up

# Storybook にアクセス
open http://localhost:6006
```

## プロジェクト固有の Storybook

プロジェクト独自のコンポーネントカタログを構築する場合:

```bash
# プロジェクトルートで
npx storybook@latest init
```

## コンポーネントスキャフォールディング

Penpot コンポーネントから Storybook ストーリーのテンプレートを生成する MCP ワークフロー:

```javascript
// MCP で Penpot コンポーネント一覧を取得
const components = penpot.library.local.components;
return components.map(c => ({
  name: c.name,
  path: c.path
}));
```

取得したコンポーネント情報をもとに、Claude Code の Write ツールで `.stories.tsx` ファイルをスキャフォールド:

```
src/components/
├── Button/
│   ├── Button.tsx
│   ├── Button.css
│   └── Button.stories.tsx
└── Card/
    ├── Card.tsx
    ├── Card.css
    └── Card.stories.tsx
```

## 日常ワークフロー: コンポーネント追加

```
1. デザイナー: Penpot で新コンポーネントをデザイン、トークンを適用
2. 開発者: MCP でコンポーネント情報を取得
3. 開発者: Storybook でコンポーネントを実装（トークン生成 CSS 変数を使用）
4. 開発者: ストーリーを作成・動作確認
```

## 日常ワークフロー: トークン変更

```
1. デザイナー: Penpot でトークン値を変更
2. Pipeline 01 でエクスポート → リポジトリにコミット
3. Pipeline 02 で Style Dictionary ビルド → CSS 変数再生成
4. Storybook をビルド → 変更が反映される
```
