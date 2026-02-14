# IME入力時のバグ — upstream修正メモ

## 概要

IME（日本語・中国語・韓国語等）に関連する2つの問題。

### 問題1: コメント入力での二重表示

IME有効時、コメント入力欄でEnterキーを押して変換を確定すると、テキストが二重に表示される。

```
入力: あああ → Enter（確定）
期待: あああ
実際: あああ
      あああ
```

### 問題2: キャンバス上テキスト編集時のクラッシュ（ABEND）

キャンバス上のText要素をIMEで編集すると、ランタイムパッチ（`ime-fix.js`）がクラッシュし、連鎖的にテキストエディタライブラリの `resolveComposition` でも例外が発生する。

```
TypeError: parentClass.indexOf is not a function
  at HTMLDocument.<anonymous> (ime-fix.js:71:25)

Error: Minified exception occurred; ...
  at Object.resolveComposition (libs.js:46:2767)
```

**原因**: SVG要素の `className` プロパティは文字列ではなく `SVGAnimatedString` オブジェクトを返す。パッチが `target.className.indexOf()` や `parent.className.indexOf()` を呼び出していたため `indexOf is not a function` でクラッシュ。このクラッシュがIME compositionの状態管理を破壊し、テキストエディタライブラリ側の `resolveComposition` エラーも誘発していた。

**影響バージョン**: v2.13.2（それ以前も同様と推測）
**影響コンポーネント**: コメント入力（ワークスペース・ビューア共通）、キャンバス上テキスト編集

---

## 根本原因

`frontend/src/app/main/ui/comments.cljs` の `comment-input*` コンポーネント内 `handle-key-down` ハンドラが、`KeyboardEvent.isComposing` をチェックしていない。

### 発生メカニズム

1. ユーザーがIMEで「あああ」と入力し、Enterで確定
2. ブラウザが `compositionend` を発火 → テキスト「あああ」がDOMに確定挿入される
3. 直後に `keydown(Enter)` が発火（`event.isComposing = true` または直後）
4. `handle-key-down` がこのEnterを通常の改行操作として処理
5. 改行（`\n`）がDOMに挿入され「あああ\nあああ」相当の表示になる

---

## 修正対象コード

### ファイル: `frontend/src/app/main/ui/comments.cljs`

`comment-input*` コンポーネントの `handle-key-down` 関数（L335付近）:

```clojure
handle-key-down
(mf/use-fn
 (mf/deps on-esc on-ctrl-enter handle-select handle-input)
 (fn [event]
   (handle-select event)
   (when-let [node (mf/ref-val local-ref)]
     (when-let [[span-node offset] (current-text-node node)]
       (cond
         ;; メンション選択時のEnter
         (and @cur-mention (kbd/enter? event))
         (do (dom/prevent-default event)
             (dom/stop-propagation event)
             (rx/push! mentions-s {:type :insert-selected-mention}))

         ;; ... 他の条件 ...

         ;; Ctrl+Enter → 送信
         (and (kbd/mod? event) (kbd/enter? event) (fn? on-ctrl-enter))
         (on-ctrl-enter event)

         ;; ★ ここが問題: Enter → 改行挿入（IMEチェックなし）
         (kbd/enter? event)
         (let [sel (wapi/get-selection)
               range (.getRangeAt sel 0)]
           (dom/prevent-default event)
           (dom/stop-propagation event)
           ;; ... 改行挿入処理 ...
           ))))))
```

### 関連ファイル: `frontend/src/app/util/keyboard.cljs`

`enter?` 関数の定義:

```clojure
(def enter? (is-key? "Enter"))

(defn is-key?
  ([^string key]
   (fn [^KeyboardEvent event]
     (= (.-key event) key)))
  ([^KeyboardEvent event ^string key]
   (= (.-key event) key)))
```

`is-key?` は `event.isComposing` を考慮していない。

---

## 推奨修正案

### 案A: `handle-key-down` でガード（最小変更）

`comment-input*` の `handle-key-down` 冒頭にIMEガードを追加:

```clojure
handle-key-down
(mf/use-fn
 (mf/deps on-esc on-ctrl-enter handle-select handle-input)
 (fn [event]
   ;; ★ 追加: IME変換中のキーイベントを無視
   (when-not (.-isComposing event)
     (handle-select event)
     (when-let [node (mf/ref-val local-ref)]
       (when-let [[span-node offset] (current-text-node node)]
         (cond
           ;; ... 既存の条件分岐 ...
           ))))))
```

### 案B: `keyboard.cljs` にユーティリティ追加（推奨）

`app.util.keyboard` に汎用の `composing?` チェックを追加し、各所で利用:

```clojure
;; keyboard.cljs に追加
(defn ^boolean composing?
  "Returns true if the event is part of an IME composition."
  [^js event]
  (true? (.-isComposing event)))
```

`comment-input*` での使用:

```clojure
(fn [event]
  (when-not (kbd/composing? event)
    ;; 既存処理
    ))
```

### 案C: `is-key?` 自体にIMEガード組み込み（影響範囲大）

```clojure
(defn is-key?
  ([^string key]
   (fn [^js event]
     (and (not (.-isComposing event))
          (= (.-key event) key))))
  ([^js event ^string key]
   (and (not (.-isComposing event))
        (= (.-key event) key))))
```

> ⚠️ 案Cはアプリ全体のキーボード処理に影響するため慎重な検証が必要。案Bを推奨。

---

## 影響を受ける可能性のある他の箇所

`kbd/enter?` を `contentEditable` や `input` 要素の `on-key-down` で使用している箇所は同様のIME問題を持つ可能性がある:

| ファイル | コンポーネント | 備考 |
|---------|-------------|------|
| `ui/comments.cljs` | `comment-input*` | **本件の主要箇所** |
| `ui/dashboard/inline_edition.cljs` | `inline-edition` | `on-keyup` で `kbd/enter?` 使用（keyupなので影響小） |
| `ui/components/forms.cljs` | `multi-input` | `on-key-down` で `kbd/enter?` 使用 |
| `ui/components/editable_label.cljs` | `editable-label` | `on-key-up` で使用（影響小） |
| `ui/components/color_input.cljs` | `color-input` | `handle-key-down` で使用 |
| キャンバス テキスト編集 | text-editor (libs.js内) | テキストエディタライブラリ内部の `resolveComposition`。ランタイムパッチでの対処困難、upstream修正待ち |

---

## ランタイムパッチ: SVGAnimatedString クラッシュ修正

### 修正日: 2026-02-14

### 問題

PenpotのキャンバスはSVGで描画される。SVG要素の `className` は HTML要素のような `string` ではなく `SVGAnimatedString` オブジェクトを返すため、`.indexOf()` メソッドが存在せずクラッシュする。

```javascript
// NG: SVG要素では className は SVGAnimatedString
var cls = target.className || "";        // SVGAnimatedString オブジェクト
cls.indexOf("comment-input");             // TypeError: indexOf is not a function

var pc = parent.className || "";          // 同上
pc.indexOf("comment");                    // TypeError
```

### 修正内容

`getClassName()` ヘルパー関数を追加し、SVG/HTML両要素で安全にclass文字列を取得:

```javascript
function getClassName(el) {
  if (!el) return "";
  var cn = el.className;
  if (typeof cn === "string") return cn;              // HTML要素
  if (cn && typeof cn.baseVal === "string") return cn.baseVal;  // SVG要素
  return el.getAttribute("class") || "";              // フォールバック
}
```

`target.className` / `parent.className` の直接参照を全て `getClassName(target)` / `getClassName(parent)` に置換。

### 確認結果

- [x] キャンバス上テキスト編集でクラッシュしなくなった
- [x] コメント入力欄のIME二重表示防止は引き続き動作
- [ ] `resolveComposition` エラー（テキストエディタライブラリ内部）はパッチのクラッシュ連鎖が解消されたことで発生しなくなったが、ライブラリ自体のIMEハンドリングは別問題としてupstream修正待ち

---

## テスト観点

- [ ] 日本語IME（Google日本語入力、macOS標準）でコメント入力 → Enter確定 → 二重表示されない
- [ ] 中国語IME（Pinyin）で同様のテスト
- [ ] 韓国語IMEで同様のテスト
- [ ] IME無効時のEnterキー動作が変わらない（改行挿入）
- [ ] Ctrl+Enter送信が正常に動作する
- [ ] メンション選択時のEnterが正常に動作する
- [ ] Esc、矢印キー等の他のキーバインドに影響がない
- [ ] キャンバス上のText要素をIME（日本語）で編集 → クラッシュしない
- [ ] キャンバス上のText要素をIME無効で編集 → 通常通り動作する

### ブラウザ別の注意点

- **Chrome/Edge**: `keydown` で `isComposing=true` が正しく設定される
- **Firefox**: `compositionend` の後に `keydown(Enter, isComposing=false)` が発火するケースがある → `compositionend` 後の短い猶予期間（~300ms）のガードが必要な場合あり
- **Safari**: Chrome と同様の挙動

---

## ワークアラウンド（現在のセルフホスト環境）

`penpot-selfhost/patches/` にランタイムパッチとして実装済み。  
`.env` の `PENPOT_PATCH_IME_FIX=false` で無効化可能。  
upstream修正後に `PENPOT_PATCH_IME_FIX=false` を設定して動作確認し、問題なければ `patches/` を削除。

### パッチ変更履歴

| 日付 | 変更内容 |
|------|----------|
| 初版 | コメント入力欄のIME二重表示防止パッチ作成 |
| 2026-02-14 | SVGAnimatedString クラッシュ修正 — `getClassName()` ヘルパー追加 |

---

## 参考

- [KeyboardEvent.isComposing (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)
- [CompositionEvent (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/CompositionEvent)
- [W3C UI Events: Composition Event Order](https://www.w3.org/TR/uievents/#events-composition-event-order)
- [SVGAnimatedString (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/SVGAnimatedString) — SVG要素の `className` が返すオブジェクト型
