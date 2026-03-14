# Penpot スキル動作確認シナリオ: アカウント管理アプリ「MyAccount」（MD3 ライブラリ活用）

## Context

Penpot スキルの「デザイン作成」ルートの動作を検証する。お題は **アカウント管理アプリ「MyAccount」** の 4 画面プロトタイプ。フォーム中心の画面構成により **テキストプロンプトからレイアウトが一意に決まりやすい** 特性を持つ。「Material Design 3」ライブラリのコンポーネントを接続・活用して構築することで、ライブラリ接続→コンポーネント発見→インスタンス利用のパスも検証する。

### なぜこのお題か

- **レイアウト固定度が高い**: 全4画面がフォームまたはトグルリストで構成。「ラベル+入力欄」の縦積み、「ラベル+Switch」の行は配置の解釈余地がほぼゼロ
- **MD3 コンポーネント活用度が高い**: Switch, Checkbox, Avatar, Divider, Text Field 等が instance() で直接利用可能
- **プロンプト再現性の検証に最適**: 同じプロンプトで複数回実行しても同一レイアウトが期待できる

## 前提条件

- Docker 環境が利用可能
- Penpot 上に **「Material Design 3」** が共有ライブラリとして存在する（382 コンポーネント）
- トークン（Shared/Light/Dark セット）が登録済みであれば活用、なければ `ensureSemanticTokens()` で自動登録

## 成果物

マークダウンファイル 1 つ（`docs/penpot-test-scenario-myaccount.md`）+ Penpot 上の 4 画面プロトタイプ

---

## フロー全体像

```
Step 1: 環境起動
  └→ /penpot 起動
  └→ penpot-manage.sh → activate → metrics 確認

Step 2: スキルロード + デザイン作成ルート開始
  └→ /penpot デザイン
  └→ SKILL.md ロード → ルーティング → activate → Read(mcp-api.md, design.md)
  └→ metrics でライブラリ状態判定

Step 3: デザイン指示（MyAccount 4 画面仕様）
  └→ ユーザーがアプリ仕様を提示
  └→ 親AI: Phase 1（理解）→ Phase 2（設計）
  └→ ライブラリコンポーネントと画面要素のマッピング提示

Step 4: 実装委譲（自動）
  └→ 親AI: 委譲テンプレート7項目（ライブラリ情報込み）
     → penpot-mcp サブエージェント
  └→ サブエージェント:
     activate → ライブラリ接続確認/コンポーネント取得
     → execute_code × N（コンポーネントインスタンス活用）
     → validateDesign → export_shape

Step 5: 受入レビュー委譲（自動）
  └→ 親AI: レビュー用テンプレート → penpot-mcp（レビューモード）

Step 6: 完了・URL案内

（任意）Step 7: テーマ切替確認
（任意）Step 8: 環境停止
```

---

## 4 画面の構成

| # | 画面名 | 主な UI 要素 | MD3 コンポーネント活用 |
|---|--------|-------------|----------------------|
| 1 | Login | Email/Password 入力、ボタン 2 種、テキストリンク | Text Field, Button Filled, Button Text, Divider |
| 2 | Registration | 4 フィールド、Checkbox、ボタン | Text Field, Checkbox, Button Filled |
| 3 | Profile | Avatar、3 フィールド、ボタン | Avatar, Text Field, Button Filled |
| 4 | Settings | トグル行 6 件、ボタン 2 種 | Switch On/Off, Divider, Button Outlined |

---

## Step 1: 環境起動

### プロンプト

```
/penpot 起動
```

### AI の期待動作

1. SKILL.md ロード → キーワード「起動」→ 環境セットアップにルーティング
2. `selfhost.md` を Read
3. `penpot-manage.sh status` → 未起動なら `up` → `mcp-connect claude` → `wait-mcp claude`
4. `activate` 呼び出し → context/metrics 返却

### 確認ポイント

- [ ] `penpot-manage.sh` 経由で操作している
- [ ] `activate` の返却に context/metrics が含まれる
- [ ] http://localhost:9001 にアクセス可能

---

## Step 2: スキルロード + デザイン作成ルート開始

### プロンプト

```
/penpot デザイン
```

### AI の期待動作

1. SKILL.md ロード → キーワード「デザイン」→ 「デザイン作成」にルーティング
2. `activate` 呼び出し → context/metrics 返却
3. `mcp-api.md`, `design.md` を Read
4. **ライブラリ状態判定**:
   - `metrics.connectedLibs` の値を確認
   - 「Material Design 3」が未接続なら `storage.getSharedLibraries()` → `storage.connectLibrary()` の手順を委譲に含める
5. デザイン指示の入力を待つ

### 確認ポイント

- [ ] ルーティングが「デザイン作成」に入っている
- [ ] `mcp-api.md` と `design.md` の Read が行われている
- [ ] `metrics.connectedLibs` の値に基づいたライブラリ状態の言及がある

---

## Step 3: デザイン指示（MyAccount 4 画面仕様）

### プロンプト

```
penpot でMyAccountページを新規作成する。
その後、MyAccountページ上で、
アカウント管理アプリ「MyAccount」のプロトタイプを作成してください。
Penpot上の共有ライブラリ「Material Design 3」のコンポーネントを接続・活用して構築してください。

## 画面構成（4画面、同一ページ内ボード、各 1280×900）

### 画面 1: Login
フォームコンテナ: 最大幅 400px、ボード中央（水平・垂直）
- 「MyAccount」タイトル（大きめ、太字、中央揃え）
- 「Sign in to your account」サブタイトル（中央揃え）
- Email 入力フィールド（プレースホルダ: you@example.com）
- Password 入力フィールド
- 「Forgot Password?」リンク（右揃え、アクセントカラー）
- 「Login」ボタン（Filled）
- Divider
- 「Don't have an account?」+「Sign Up」リンク（アクセントカラー）

### 画面 2: Registration
- Top App Bar: ← Back +「Create Account」
- フォームコンテナ: 最大幅 400px、中央
  - Full Name / Email / Password / Confirm Password 入力フィールド
  - チェックボックス +「I agree to the Terms of Service」
  - 「Register」ボタン（Filled）

### 画面 3: Profile
- Top App Bar:「Profile」+ ⚙ アイコン
- フォームコンテナ: 最大幅 400px、中央
  - Avatar（64×64）
  - 表示名「John Doe」（太字、中央揃え）
  - Full Name / Email / Phone 入力フィールド（値入り: John Doe, john@example.com, +1 234 567 8900）
  - 「Save Changes」ボタン（Filled）

### 画面 4: Settings
- Top App Bar: ← Back +「Settings」
- コンテンツコンテナ: 最大幅 600px、中央
  - ACCOUNT セクション: Email notifications(ON), Push notifications(ON), SMS notifications(OFF)
  - Divider
  - SECURITY セクション: Two-factor authentication(OFF), Biometric login(ON)
  - Divider
  - APPEARANCE セクション: Dark mode(OFF)
  - Divider
  - 「Logout」ボタン（Outlined、エラー色）
  - 「Delete Account」テキストリンク（エラー色）

## MD3 コンポーネント活用
instance() で配置するもの:
- Switch On/Off → Settings のトグル行
- Checkbox → Registration の利用規約
- Avatar → Profile のアバター
- Full Width Divider → Login の区切り、Settings のセクション区切り

上記以外の要素（Top App Bar、入力フィールド、ボタン等）はテキストが画面ごとに異なるため直接構築。

## インタラクション（7件）

| トリガー | アクション | ターゲット |
|---|---|---|
| Login「Login」ボタン | navigate-to | Profile |
| Login「Sign Up」 | navigate-to | Registration |
| Registration「← Back」 | previous-screen | — |
| Registration「Register」 | navigate-to | Profile |
| Profile ⚙ | navigate-to | Settings |
| Settings「← Back」 | previous-screen | — |
| Settings「Logout」 | navigate-to | Login |

## テーマ
- Light / Dark テーマ対応（セマンティックトークン使用）
```

### AI の期待動作

**Phase 1（理解）**: 仕様が具体的なのでヒアリング不要。4 画面 + 7 インタラクション + ライブラリ活用の規模を認識。

**Phase 2（設計）**:
- ライブラリのコンポーネント一覧と画面要素のマッピングを整理
- ライブラリにある/ないコンポーネントの仕分け提示
- レイアウト構成の簡潔な整理

**Phase 3 開始ゲート**:
1. 委譲テンプレート（7 項目）にライブラリ情報を含めて準備
2. `execute_code` を自分で呼ぼうとしていないか確認

### 確認ポイント

- [ ] Phase 1 でヒアリングなしに Phase 2 へ進む
- [ ] Phase 2 でライブラリコンポーネントと画面要素のマッピングが提示される
- [ ] Phase 3 で `execute_code` を直接呼ばず、サブエージェント委譲へ進む

---

## Step 4: 実装委譲（自動 — Step 3 の直後）

### プロンプト

なし（Step 3 の続きとして自動実行）

### AI の期待動作

**親 AI の委譲テンプレート（7 項目）**:

| # | 項目 | 期待内容 |
|---|------|---------|
| 1 | エージェント定義 Read | `.claude/agents/penpot-mcp.md` |
| 2 | 作業スコープ | MD3 ライブラリ接続 + 4 画面構築 + 7 インタラクション。`metrics.tokenSets > 0` なら `ensureSemanticTokens` 不要 |
| 3 | 参考リファレンス | `mcp-api.md`, `design.md`, `howto/multi-screen-prototype.md`, `library-architecture.md` |
| 4 | storage 状態 | `context.connectedLibs` の内容。MD3 未接続の場合その旨 |
| 5 | 成果物定義 | 4 画面ボード + 7 インタラクション + MD3 コンポーネント活用 + トークン適用 |
| 6 | デザイン仕様 | ASCII ワイヤーフレーム + テキストコンテンツ一覧 + インタラクション対応表 + コンポーネントマッピング |
| 7 | エラー時 | エージェント定義のエラー回復戦略に従う |

**MD3 コンポーネント活用指示**（委譲テンプレートに含まれるべき追加情報）:

```
## MD3 コンポーネント活用指示

### ライブラリ名
「Material Design 3」（ID: 0939eb45-1f9e-8065-8007-b11eb946fee8）

### 接続手順
1. activate の context.connectedLibs を確認
2. 未接続の場合: storage.connectLibrary('0939eb45-1f9e-8065-8007-b11eb946fee8')
3. penpot.library.connected から find し .components で一覧取得

### コンポーネントマッピング

instance() で配置するもの（テキスト変更不要 or 装飾的）:
| MD3 コンポーネント | path | 配置先 |
|---|---|---|
| Switch On | Switch | Settings トグル ON (3件) |
| Switch Off | Switch | Settings トグル OFF (3件) |
| Checkbox [selected] | Checkbox | Registration 利用規約 |
| Avatar | _Miscellaneous / Avatar | Profile アバター |
| Full Width Divider | Divider | Login 区切り, Settings セクション区切り |

直接構築するもの（MD3 スタイル参考、テキストカスタマイズ必要）:
- Top App Bar（各画面のタイトル・ボタンが異なるため）
- Text Field（ラベル・値が各フィールドで異なるため）
- Button Filled/Outlined/Text（テキストが異なるため）
- トグル行の構造（ラベル + Switch の Flex row）

### ヘルパー関数仕様

サブエージェントはヘルパー登録時に以下のパラメータを必ず受け取ること:

1. **createTextField(parent, { label, value?, placeholder?, gap? })**
   - 「共通構造定義 > フォームフィールド」に従う
   - ラベル: fontSize=14, fontWeight="regular", align="left"
   - 値テキスト: fontSize=16, fontWeight="regular"

2. **createFilledButton(parent, { label, gap? })**
   - 「共通構造定義 > ボタン > Filled」に従う
   - ラベル: fontSize=16, **fontWeight="bold"**, align="center"

3. **createOutlinedButton(parent, { label, gap?, strokeToken? })**
   - 「共通構造定義 > ボタン > Outlined」に従う
   - ラベル: fontSize=16, **fontWeight="bold"**, align="center"

4. **createTopAppBar(parent, { leftText?, title, rightIcon? })**
   - 「共通構造定義 > Top App Bar」に従う
   - title: fontSize=20, **fontWeight="semibold"**, align="center"

5. **createToggleRow(parent, { label, switchState })**
   - 「共通構造定義 > トグル行」に従う

6. **createText での fontWeight/align 指定ルール**
   - `storage.createText(chars, { fontSize, fontWeight, textAlign })` の全パラメータを「テキストコンテンツ一覧」テーブルから取得
   - fontWeight は必ず明示的に指定（省略時 "regular" がデフォルトであることに注意）
   - align は必ず明示的に指定（省略時 "left" がデフォルト）
```

**サブエージェント（penpot-mcp）の動作**:

1. `activate` → context/metrics 確認
2. `.claude/agents/penpot-mcp.md` を Read
3. リファレンス Read
4. MD3 ライブラリ接続 + コンポーネント発見（execute_code 1回目）
5. 4 画面構築（execute_code × 8〜12回）
6. インタラクション設定（7件）
7. `validateDesign()` + `export_shape` で自己レビュー
8. サマリ形式で返却

### 確認ポイント

- [ ] 委譲テンプレート 7 項目が全て含まれている
- [ ] MD3 ライブラリ情報（ID・接続手順）が委譲に含まれる
- [ ] コンポーネント発見・マッピング手順が含まれる
- [ ] `metrics.tokenSets > 0` の場合 `ensureSemanticTokens()` 指示なし
- [ ] howto 選択: `multi-screen-prototype.md` + `library-architecture.md`
- [ ] 委譲に「activate 不要」「初期化済み」等の文言がない
- [ ] サブエージェントが MD3 を `storage.connectLibrary()` で接続
- [ ] `lib.components` でコンポーネント一覧を発見
- [ ] Switch On/Off, Checkbox, Avatar, Divider が `instance()` で配置
- [ ] 4 画面が同一ページ内のボードとして配置
- [ ] サブエージェントが `validateDesign()` + `export_shape` で自己レビュー

---

## Step 5: 受入レビュー委譲（自動 — Step 4 の直後）

### プロンプト

なし（Step 4 完了後に自動実行）

### AI の期待動作

親 AI がレビュー用委譲テンプレートで penpot-mcp に再委譲:

| # | 項目 | 期待内容 |
|---|------|---------|
| 1 | エージェント定義 Read | `.claude/agents/penpot-mcp.md`（レビューモード参照） |
| 2 | リファレンス Read | `comments.md` |
| 3 | 対象 | Login / Registration / Profile / Settings 全 4 ボード |
| 4 | スコープ | Step 3 の要件仕様との差分確認。MD3 コンポーネントが正しく使われているか。変更なし、差分報告のみ |
| 5 | 成果物 | チェックリスト評価結果 + 差分報告 |

### 確認ポイント

- [ ] 親 AI がレビュー委譲テンプレート（5 項目）で再委譲
- [ ] レビューモードの指示が明示されている
- [ ] サブエージェントがデザイン変更を行わず報告のみ

---

## Step 6: 完了・URL 案内

### プロンプト

なし（Step 5 完了後に自動実行）

### AI の期待動作

1. `penpot-manage.sh urls` で URL 案内
2. 完成サマリ:
   - 4 画面のボード一覧
   - 7 インタラクション
   - 使用した MD3 コンポーネント一覧
   - 直接構築した要素一覧
   - レビュー結果

### 確認ポイント

- [ ] Penpot の URL が表示される
- [ ] ブラウザでデザイン確認可能

---

## Step 7（任意）: テーマ切替確認

### プロンプト

```
Dark テーマに切り替えて、Login ボードをエクスポートしてください。
```

### 確認ポイント

- [ ] `switchThemePersistent` で永続切替
- [ ] Dark テーマで背景色・テキスト色が反転した画像が確認可能

---

## Step 8（任意）: 環境停止

### プロンプト

```
/penpot 停止
```

### 確認ポイント

- [ ] `penpot-manage.sh down` で停止

---

## 横断チェックリスト

| # | チェック項目 | 合否 |
|---|---|---|
| 1 | 親 AI が `execute_code` を直接呼んでいない | |
| 2 | `activate` はサブエージェントが自律実行（「不要」指示なし） | |
| 3 | storage ラッパー使用（`storage.createText()`, `storage.connectLibrary()` 等） | |
| 4 | fontFamily が sourcesanspro（MD3 インスタンス内部除く） | |
| 5 | 4 画面が同一ページ内のボード | |
| 6 | テーマは別ボードではなくセット切替 | |
| 7 | 環境操作は `penpot-manage.sh` 経由 | |
| 8 | インタラクションが 7 件設定されている | |
| 9 | navigate-to は同一ページ内のボード間のみ | |
| 10 | MD3 コンポーネントが `instance()` で利用されている（Switch, Checkbox, Avatar, Divider） | |
| 11 | ライブラリにない要素のみ直接構築 | |
| 12 | `penpot.library.connectLibrary()` ではなく `storage.connectLibrary()` 使用 | |
| 13 | Login/Registration のフォームが中央寄せ（最大幅 400px） | |
| 14 | 全フォームフィールドが同一幅（全幅） | |
| 15 | トグル行が統一構造（ラベル + Switch, h:56, Flex row） | |

---

## レイアウト固定度の検証ポイント

このシナリオ特有の検証: **同じプロンプトで再実行した場合に同一レイアウトが得られるか**

| 画面 | 固定される要素 | 変動しうる要素 |
|---|---|---|
| Login | フィールド順序、ボタン配置、中央寄せ | フォームコンテナの垂直位置 |
| Registration | 4フィールドの縦積み順序、Checkbox位置 | ナビバーのスタイル詳細 |
| Profile | Avatar→Name→3フィールド→ボタンの順序 | Avatar サイズ微調整 |
| Settings | セクション順序、トグル行構造、ボタン配置 | セクション間スペーシング |

「変動しうる要素」が最小限であることがこのお題の特徴。

---

## 関連ファイル

| ファイル | 用途 |
|---------|------|
| `.claude/skills/penpot/SKILL.md` | ルーティングマップ・委譲ルール |
| `.claude/agents/penpot-mcp.md` | サブエージェント定義 |
| `.claude/skills/penpot/reference/core/mcp-api.md` | API 制約・storage ラッパー |
| `.claude/skills/penpot/reference/core/design.md` | デザイン原則 |
| `.claude/skills/penpot/reference/core/delegation-format.md` | 委譲仕様フォーマット |
| `.claude/skills/penpot/reference/core/library-architecture.md` | ライブラリ接続・コンポーネント利用 |
| `.claude/skills/penpot/reference/howto/multi-screen-prototype.md` | 複数画面パターン |
| `.claude/skills/penpot/reference/core/comments.md` | レビュー・コメント |

## 自己レビュー: 95/100

**加点**: フォーム中心の 4 画面構成によりレイアウト固定度が極めて高い。MD3 の Switch/Checkbox/Avatar/Divider が instance() で直接利用可能。トグル行の構造を「h:56, Flex row, ラベル fill + Switch」と完全固定。全フォームフィールドが「全幅、垂直スペース 16px」で統一。インタラクション 7 件が Login→Register→Profile→Settings の自然なフローを構成。「レイアウト固定度の検証ポイント」セクションで再現性の評価基準を明示。
**減点**: Text Field の instance() 利用が困難（テキスト変更必要）なため、フォームフィールドは直接構築になる可能性が高い（-3）。Password フィールドのマスク表現が Plugin API で実現可能か未確認（-2）。
