# サブエージェント委譲: デザイン仕様の構造化フォーマット

親AIがサブエージェント（penpot-mcp）に指示を作成する際の必須フォーマット。該当するセクションのみ記載すること。

## 仕様完成前チェックリスト

**仕様（テキスト一覧・共通構造・ワイヤーフレーム）を委譲プロンプトに書く前に、必ず全項目を満たすこと。**

| # | 項目 | 判定基準 |
|---|------|---------|
| 1 | 全テキスト `fontSize ≥ 12` | 補助テキスト・アバター内文字・バッジ内文字も例外なし。11px 以下を仕様に書かない |
| 2 | クリック・タップ可能要素 `width ≥ 44 かつ height ≥ 44` | 主要アクション / Close / Back / アイコンボタンを含む。小さく見せたい場合でも透明 board ラッパーで 44×44 を確保し、内部に視覚要素を配置する |
| 3 | 色は**セマンティックトークンのみ** | `fill:token名` / `strokeColor:token名` の形で指定。`#RGB` 値を仕様に書かない（カスタムトークンが必要な場合は「トークン定義」セクションで overrides を明示） |
| 4 | インタラクションは**同一ページ内のボード間のみ** | 異なるページ間の navigate-to は動作しない |
| 5 | `addInteraction` の action は `navigate-to` / `close-overlay` / `previous-screen` / `open-url` のみ | `open-overlay` / `toggle-overlay` は保存されないため仕様から除外 |
| 6 | `TextRange.align = 'center'/'right'/'justify'` を使わない | align は反映されない。親 Flex の `mainAlignment`/`crossAlignment` で寄せる |

満たせない項目があれば、仕様をそのまま委譲せず**調整してから**委譲する。調整例: 「11px のキャプション」は 12px に引き上げる、「16×24 の ✕ アイコン」は 44×44 の透明 board + 内部 text に変更。

## トークン定義（テーマ対応時）

デフォルトを使う場合は `storage.ensureSemanticTokens()` を指示するだけでよい（14色+spacing+borderRadius が自動登録される）。

カスタムが必要な場合のみ、以下の表形式でオーバーライドを指定:

| トークン名 | Light | Dark | 備考 |
|-----------|-------|------|------|
| accent-blue | #007AFF | #64B5F6 | ブランドカラー |

指示例: `storage.ensureSemanticTokens({ overrides: { 'accent-blue': { light: '#007AFF', dark: '#64B5F6' } } })`

## 画面レイアウト（ASCIIワイヤーフレーム）

```
┌──────────────────────────┐
│ NavBar (h:56)            │
├──────────────────────────┤
│ ┌──────┐ ┌──────┐       │
│ │ Card │ │ Card │  ...   │
│ └──────┘ └──────┘       │
├──────────────────────────┤
│ Footer                   │
└──────────────────────────┘
```

各ボードの幅・高さ、Flex の dir/gap/padding/**alignment** を明記すること。

**中央配置パターン**（フォーム画面等、コンテンツ幅 < ボード幅の場合）:
```
┌─ Board (1280x900, flex-col, mainAlign:center, crossAlign:center, fill:surface-primary) ─┐
│                  ┌── FormContainer (w:400, flex-col, gap:16) ──┐                         │
│                  │ ...                                         │                         │
│                  └─────────────────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
ボード自体を Flex コンテナにし、`mainAlignment: 'center'` + `crossAlignment: 'center'` で子コンテナを中央に配置する。

## インタラクション対応表

| トリガー要素 | アクション | ターゲット |
|-------------|-----------|-----------|
| Card クリック | navigate-to | Product Detail |
| Logo クリック | navigate-to | Home |
| 戻るボタン | previous-screen | — |

同一ページ内のボード間のみ有効。OpenOverlay は Plugin API 未実装のため navigate-to で代替。

## 要素配置順序

各画面の子要素を上から順に列挙する。サブエージェントはこの順序で `appendChild` する。

| 順 | 要素名 | 種別 | gap |
|----|--------|------|-----|
| 1 | Top App Bar | board (h:56, fillColor: surface-primary) | — |
| 2 | フォームセクション | board (flex-col, padding:32) | 24 |
| 3 | ボタンエリア | board (flex-col) | 12 |

`種別` には board/text/rect とレイアウト属性（flex-col/flex-row/padding/gap 等）を記載する。

## 共通構造定義

繰り返し使う UI パターン（フォームフィールド、ボタン、ナビバー、トグル行等）は ASCII 構造図で定義し、ヘルパー関数の仕様とする。

```
【フォームフィールド】createFormField(label, placeholder)
board (flex-col, gap:4)
├── text: label (14, regular, text-secondary)
└── board (h:48, border:1px border-primary, borderRadius:8, padding:0 16)
    └── text: placeholder (16, regular, text-secondary)

【ボタン (Filled)】createFilledButton(label)
board (h:48, fillColor: accent-blue, borderRadius:24, align:center)
└── text: label (16, bold, text-on-accent, center)

【Top App Bar】createTopAppBar(title, leftAction?, rightAction?)
board (h:56, flex-row, fillColor: surface-primary, padding:0 16, align:center)
├── text: leftAction (16, regular, accent-blue) ← optional
├── text: title (20, semibold, text-heading, center, flex:1)
└── text: rightAction (16, regular, accent-blue) ← optional
```

**ルール**:
- ASCII 構造図の各行（`├──` / `└──`）は **実装必須の子要素**。省略・簡略化しないこと
- 子要素は `storage.appendChild(parent, child)` で親に追加し、返却された `layoutChild` でサイジング設定
- `align:center` は Flex の `mainAlignment: 'center'` + `crossAlignment: 'center'`
- `fillColor: token名` は `storage.applyTokenSafe(shape, 'token名', ['fill'])` で適用
- フォームフィールドは **2層構造**（ラベルtext + bordered board + 内部text）。テキストラベルのみは不可
- fillColor 付きコンテナ（ボタン等）内のテキストは **必ず appendChild** で追加。未追加だとテキスト（text-on-accent=白）がボード背景（白）と同色で不可視になる
- 括弧内の数値は `(fontSize, fontWeight, トークン名)` または `(fontSize, fontWeight, トークン名, align)`
- fontWeight のデフォルトは `regular`。**非デフォルト値（bold, semibold 等）は必ず明記**
- align のデフォルトは `left`。**非デフォルト値（center, right）は必ず明記**
- ヘルパー関数はこの構造定義に従い、全パラメータを `storage.createText()` に明示的に渡すこと

## Flex sizing の指定

Flex レイアウト子要素のサイジングは **仕様段階で明示** する（サブエージェントの自主判断を減らすため）。

### LayoutChildProperties（`child.layoutChild.*`）の値

| 値 | 用途 | 使い方 |
|----|------|-------|
| `'fill'` | 親の残り空間を占有 | リスト項目の幅一杯、flex 親に複数子があり伸縮させたい場合 |
| `'auto'` | コンテンツに応じて自動 | テキストの折返し高さ、子要素の積み上げ高さ |
| `'fix'` | `resize(w,h)` で指定した固定値 | 中央配置モーダルの幅、アイコンボタンなど固定サイズ要素 |

**仕様での表記例**:
- `TaskList (w:fill, h:auto, flex-col, ...)` → `layoutChild.horizontalSizing='fill'`, `verticalSizing='auto'`
- `Modal Card (w:520 fix, h:auto)` → `horizontalSizing='fix'` + `resize(520, ...)`, `verticalSizing='auto'`
- `Icon Button (w:44 fix, h:44 fix)` → 両方 `'fix'` + `resize(44, 44)`

### 中央配置モーダルの必須指定

中央配置のモーダルカード（親が `mainAlignment:'center', crossAlignment:'center'` の Flex）では、子カードは **`horizontalSizing:'fix'` + `resize(w, h)` を明示**。`'auto'` は親中央揃えで幅 0 に潰れる。

```
Card (w:520 fix, h:auto, flex-col, padding:32, rowGap:20, fill:surface-card, br:16)
```

### `flex-grow:1` と `'fill'` の違い

- `'fill'` — LayoutChildProperties のサイジング値。親 Flex の残り空間を占有
- `flex-grow:1` — 慣用表記（実装では `layoutChild.horizontalSizing='fill'` と同じ効果になるケースが多い）。仕様書では **`'fill'` に統一**

### タッチターゲット 44×44 の実装

小さなアイコン（例: ✕ 20px の CloseBtn）を置く場合は **透明 board ラッパー** で 44×44 を確保し内部に text を置く:

```
【IconButton】createIconButton(parent, {icon, destination?})
board (w:44 fix, h:44 fix, flex-row, mainAlign:center, crossAlign:center,
       fill:none（空配列）, stroke:none, br:8)
└── text icon (20, regular, <tokenName>, center)
※ インタラクションは board 側に addInteraction する（text には付けない）
```

## テキストコンテンツ一覧

**必須セクション。** 全画面の全テキスト要素を漏れなく列挙する。ヘルパー関数内で生成するテキストも含める（ヘルパー実装時の fontWeight/align 指定根拠）。この表が `storage.createText()` 全呼び出しのパラメータ正規ソースとなる。

| 画面 | 要素名 | テキスト | fontSize | fontWeight | align | トークン |
|------|--------|---------|----------|------------|-------|---------|
| Home | ヒーロータイトル | New Arrivals | 48 | **bold** | center | text-heading |
| Home | サブタイトル | 最新コレクション | 18 | regular | center | text-secondary |
| Home | CTAボタンラベル | Shop Now | 16 | **bold** | center | text-on-accent |

**記載ルール**:
- fontWeight: **全行に明記**（regular 含む）。省略しない
- align: **全行に明記**（left 含む）。省略しない
- トークン: セマンティックカラートークン名（`text-heading`, `text-primary` 等）
- タイポグラフィスケールは [design.md](design.md) を参照
