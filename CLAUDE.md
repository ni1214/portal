# Portal プロジェクト — Claude Code 引き継ぎメモ

## プロジェクト概要
- **名前**: 生産管理課 ポータル
- **公開先**: GitHub Pages (`https://github.com/ni1214/portal.git` / branch: `master`)
- **バックエンド**: Firebase Firestore（プロジェクト: `kategu-sys-v15`）
- **スタック**: Vanilla JS (ES modules) + HTML + CSS — フレームワークなし
- **主要ファイル**: `index.html` / `script.js` / `style.css`

## 開発方針（重要）
- **基本方針**: GitHub Pages + Firebase 無料枠の範囲内で実装する
- バックエンド処理が必要になっても、まず「Firebase/フロントで代替できないか」を先に検討する
- Vercel等に切り替えればより良い方法がある場合は「Vercelに切り替えれば〇〇もできます」と**条件付きで提案するだけ**にする
- ユーザーはVercel等への移行を現時点では望んでいない

## Git ワークフロー
- 機能変更のたびに `git add` → `git commit` → `git push origin master`
- コミット後 GitHub Pages に自動デプロイされる（数分で反映）

## アーキテクチャ
- Firebase ESM を CDN から import（`https://www.gstatic.com/firebasejs/10.12.0/`）
- `script.js` は `type="module"` — ESM import 構文必須
- `onSnapshot` で Firestore をリアルタイム監視 → `renderAllSections()` が主な再描画関数
- **常時編集モード**: `isEditMode = true` 固定（PIN ゲートなし）

## ユーザー識別（ニックネームログイン）
- ニックネームを `localStorage('portal-username')` に保存（唯一 localStorage に残すもの）
- 個人データパス: `users/{username}/data/`, `users/{username}/private_sections/`, `users/{username}/private_cards/`
- `currentUsername` 変数で管理。`loadPersonalData(username)` で個人 Firestore データを読み込み

## 個人設定の保存先
- **Firestore が正**: `users/{username}/data/preferences`（theme / fontSize / favOnly / favorites[]）
- `localStorage` はフラッシュ防止キャッシュのみ

## Firestore コレクション一覧
| コレクション | 用途 |
|---|---|
| `cards/` | 公開カード |
| `categories/` | 公開カテゴリ |
| `notices/` | お知らせ |
| `notice_reactions/{noticeId}` | リアクション |
| `chat_messages/` | 全社チャット（廃止予定） |
| `users/{name}/data/preferences` | 個人設定（lastViewedSuggestionsAt を含む） |
| `users/{name}/data/lock_pin` | PINロック設定 |
| `users/{name}/private_sections/` | マイセクション |
| `users/{name}/private_cards/` | マイカード |
| `users_list/{name}` | ログイン記録・ニックネーム重複チェック |
| `portal/config` | 管理者PIN・Gemini APIキー・departments[]・suggestionBoxViewers[] |
| `cross_dept_requests/` | 部門間依頼（部署→部署の課題・お願い） |
| `suggestion_box/` | 目安箱（全員投稿可、閲覧は管理者のみ） |

## セキュリティ
- Firestore セキュリティルールなし（ユーザー名を知らないと個人データにアクセスできない「obscurity」方式）
- 管理者PIN: `portal/config.pinHash`（SHA-256ハッシュ）
- 個人PINロック: `users/{name}/data/lock_pin.hash`

## 次回実装予定タスク

### ① チャット機能刷新（DM + グループチャット）
現在の全社チャット（`chat_messages/`）を廃止して以下に移行：
- **DM（1対1）**: `dm_rooms/{roomId}/messages/`
  - roomId = ソート済み2ユーザー名を `_` で結合（例: `alice_bob`）
- **グループチャット**: `chat_rooms/{roomId}` (name, members[], createdBy) + `chat_rooms/{roomId}/messages/`
- **UI**: チャットパネル左にルーム/DM一覧、右にメッセージ表示
- Firestore 無料枠内（小規模社内利用）

### ② チャットメッセージ自動削除（最新200件保持）
- メッセージ送信時にフロント側で件数チェック → 200件超えたら古い順に削除
- サーバー不要・Firebase Functions 不要

### ③ タスク割り振り機能
上司・他部署の人間が部下や他部署へタスクをアサインできる仕組み。

**最重要要件：言った言わない防止**
- タスクを受け取った相手が「承諾する」ボタンを押して初めてタスクが成立する
- 承諾前は「依頼中」、承諾後は「進行中」、完了報告後は「完了」のステータス管理

**通知要件**
- タスクを割り振られた側：依頼が来たらお知らせバッジで通知
- タスクを割り振った側：相手が「完了」にしたらお知らせバッジで通知

**Firestore 設計案**
```
assigned_tasks/{taskId}
  - title          : タスク名
  - description    : 詳細
  - assignedBy     : 依頼者ニックネーム
  - assignedTo     : 担当者ニックネーム
  - status         : 'pending'（承諾待ち）| 'accepted'（進行中）| 'done'（完了）
  - createdAt      : 作成日時
  - acceptedAt     : 承諾日時
  - doneAt         : 完了日時
  - dueDate        : 期限（任意）
  - notifiedDone   : 完了通知済みフラグ
```

**UI案**
- ヘッダーにタスクアイコンボタン（未読バッジ付き）
- モーダル内にタブ：「受け取ったタスク」「依頼したタスク」「新規依頼」
- 「受け取ったタスク」タブ：承諾・完了ボタン
- 「依頼したタスク」タブ：進捗確認・完了通知の確認
- サーバー不要・Firestore のみで実現可能

## テーマ対応チェックリスト（新規UI追加時に必ず確認）

> **原則**: 色・背景・ボーダーは必ず CSS 変数 (`var(--xxx)`) を使う。ハードコードした色はテーマ切替で崩れる。

### ✅ 使うべき CSS 変数
| 用途 | 変数 |
|---|---|
| 背景（パネル・モーダル・メニュー） | `var(--bg-secondary)` |
| 背景（カード・インタラクティブ要素） | `var(--bg-glass)` / `var(--bg-card)` |
| ホバー背景 | `var(--bg-card-hover)` |
| ボーダー | `var(--border-glass)` |
| ホバーボーダー | `var(--border-glass-hover)` |
| テキスト（メイン） | `var(--text-primary)` |
| テキスト（サブ） | `var(--text-secondary)` |
| テキスト（薄い） | `var(--text-muted)` |
| アクセント（青・オレンジ） | `var(--accent-blue)` |
| アクセント（シアン） | `var(--accent-cyan)` |

### ❌ やってはいけないこと
- `background: rgba(16, 20, 50, 0.95)` のようなハードコード色（特にダーク専用の値）
- `border: 1px solid rgba(255, 255, 255, 0.06)` のような白透明ボーダー → ライトテーマで不可視
- **存在しないボタンクラスを使う**（例：`.btn-secondary` は未定義 → `.btn-modal-secondary` を使うこと）

### ボタンクラス対応表
| 用途 | 正しいクラス |
|---|---|
| キャンセル・閉じる | `.btn-modal-secondary` |
| 主要アクション（送信・保存） | `.btn-modal-primary` |
| 危険操作（削除） | `.btn-modal-danger` / `.btn-danger` |

### ウォームテーマの追加ルール
ウォームテーマではアクセント色が青→オレンジ系に変わる。ホバー背景に青の rgba を直書きした場合は `[data-theme="warm"]` のオーバーライドを忘れずに追加すること。

## UIパターン・実装規約

### モーダルの外クリック動作（必須ルール）

モーダルを新規追加するときは必ず以下の分類に従い、外クリックの動作を設定すること。

#### ✅ 外クリックで閉じて良い（表示・選択系）
入力内容がなく、閉じても作業データが消えないもの。

| モーダル ID | 用途 |
|---|---|
| `guide-modal` | 使い方ガイド（表示のみ） |
| `service-picker-modal` | サービスアイコン選択 |
| `task-user-picker-modal` | タスク担当者選択（親モーダルが残る） |
| `delete-confirm-modal` | 削除確認（Yes/No のみ） |

実装例：
```js
document.getElementById('xxx-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeXxxModal();
});
```

#### ❌ 外クリックで閉じてはいけない（入力・フォーム系）
テキスト入力・選択・設定など、閉じると作業内容が失われる可能性があるもの。
**外クリックリスナーは追加しない。代わりにコメントのみ残す。**

| モーダル ID | 用途 |
|---|---|
| `card-modal` | カード編集 |
| `category-modal` | カテゴリ編集 |
| `private-section-modal` | マイセクション編集 |
| `notice-modal` | お知らせ編集 |
| `task-modal` | タスク管理（新規依頼フォーム） |
| `reqboard-modal` | 部門間依頼・目安箱 |
| `req-status-modal` | ステータス変更（コメント入力） |
| `sugg-reply-modal` | 目安箱返信 |
| `email-modal` | メール返信アシスタント |
| `new-dm-modal` | 新規DM |
| `new-group-modal` | 新規グループ作成 |
| `username-modal` | ユーザー名入力 |
| `security-modal` | セキュリティ・PIN設定 |
| `admin-modal` | 管理者パネル |
| `pin-modal` | PINロック設定 |

実装例（コメントのみ書いて外クリックリスナーは書かない）：
```js
// xxx-modal: ○○入力フォームのため枠外クリックでは閉じない
```

#### 判断に迷ったら
「閉じたときにユーザーが再入力しなければならない情報があるか？」→ あれば外クリック無効。

### モーダル縦スクロール（必須ルール）

モーダル内でコンテンツがあふれてスクロールが出ない問題を防ぐため、新規モーダルを追加するときは必ず以下の構造パターンに従うこと。

#### パターン A：`.modal-glass` を使うシンプルなモーダル
```html
<div class="modal-overlay" id="xxx-modal">
  <div class="modal-glass">
    <!-- ヘッダー（固定） -->
    <h3 class="modal-title">タイトル</h3>
    <!-- コンテンツ（自動スクロール） -->
    ...
  </div>
</div>
```
`.modal-glass` は `max-height: 90vh; overflow-y: auto` が定義済みなので追加CSS不要。

#### パターン B：カスタム inner を使う複雑なモーダル（タブあり）
```css
/* inner: flex列 + 高さ上限 */
.xxx-modal-inner {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;   /* ← hidden にして子に任せる */
}

/* ヘッダー・タブバーなど固定部分 */
.xxx-modal-header,
.xxx-tabs {
  flex-shrink: 0;     /* ← 縮まないようにする */
}

/* コンテンツエリアのラッパー（タブ内ラッパー等） */
#xxx-content-area {
  flex: 1;
  min-height: 0;      /* ← ★ これがないと flex:1 が効かない */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* スクロールする本体 */
.xxx-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

#### ❌ よくあるミス
- `overflow: hidden` の親の中で `overflow-y: auto` の子を使っても、**途中に `min-height: 0` なしの flex 子孫があると高さ制限が無効化される**
- タブ切り替えで表示/非表示するラッパー div に flex/min-height を付け忘れる
- `.modal-glass` 使用なのに別途 `max-height` を付けず無限に伸びる

### モーダル内スクロールの背景伝播防止（必須ルール）

モーダル内でスクロールすると背景ページも一緒にスクロールしてしまう問題（スクロールチェーン）を防ぐため、以下の2段階対策が**実装済み・必ず維持すること**。

#### 対策①：CSS `overscroll-behavior: contain`
モーダル内で `overflow-y: auto` を持つすべての要素に必ず追加する。
```css
.xxx-scrollable-area {
  overflow-y: auto;
  overscroll-behavior: contain; /* ← スクロール端で親に伝播しない */
}
```
適用済み対象：`.modal-glass` / `.guide-body` / `.task-tab-content` / `.reqboard-content` /
`.email-main-area` / `.email-profile-sidebar` / `.email-tab-content` /
`.admin-user-list` / `.new-dm-user-list` / `.service-picker-grid` / `.icon-picker`

#### 対策②：JS MutationObserver による body スクロールロック
`script.js` の DOMContentLoaded 末尾に実装済み。`.modal-overlay.visible` が存在する間は
`document.body.style.overflow = 'hidden'` を自動適用する。
**新しいモーダルを追加する場合も `.modal-overlay` クラスを使えば自動で適用される。**

#### ❌ やってはいけないこと
- モーダル内の `overflow-y: auto` 要素に `overscroll-behavior: contain` を付け忘れる
- `.modal-overlay` を使わず独自のオーバーレイ構造にする（body ロックが効かなくなる）

### select ボックスのテーマ対応（必須ルール）

ブラウザネイティブの `<select>` ドロップダウンはデフォルトで OS 標準の白背景になる。
新しく `<select>` を追加する際は**必ず `.form-input` クラスを付ける**こと。それだけで以下の対策が自動適用される。

**style.css に定義済みのグローバルルール（修正不要・維持すること）**
```css
select { color-scheme: dark; }           /* ネイティブ UI を dark に統一 */
select option {
  background-color: var(--bg-secondary); /* テーマ別背景色 */
  color: var(--text-primary);
}
select.form-input { background: var(--bg-secondary); } /* 閉じた状態も塗る */
[data-theme="light"] select { color-scheme: light; }   /* ライトは light に戻す */
```

#### ❌ やってはいけないこと
- `<select>` に `.form-input` を付けずに使う（白飛びが再発する）
- `option` に `background` / `color` を直書きする（テーマ切替で崩れる）
- `select` に `background: var(--bg-glass)` を使う（透明色で option 背景が透けて白飛びする）
- フォーカス時のボーダーをハードコード（例: `#6366f1`）にする → `var(--accent-blue)` を使うこと

### 日付入力フィールド（必須ルール）
日付入力は常に「カレンダーアイコンのみ」で実装する。テキスト部分は非表示にし、アイコン色は各テーマに合わせる。

**HTML:** アイコンを左端、ラベルを右に配置する（アイコン → ラベルの順）
```html
<div class="form-group form-group-inline">
  <input type="date" id="xxx-due" class="date-icon-only">
  <label class="form-label" for="xxx-due">期限入力（省略可）</label>
</div>
```

**CSS クラス（style.css に定義済み）:**
- `.date-icon-only` — アイコンのみ表示の日付入力（34×34px、テキスト透明）
- `.form-group-inline` — ラベルとアイコンを横並びにするラッパー
- `--date-icon-filter` — テーマ別アイコン色の CSS 変数（各テーマブロックに定義済み）

**新テーマ追加時:** `:root` / `[data-theme="xxx"]` に `--date-icon-filter` を追加すること。

## テーマ一覧
| テーマ | セレクタ | 背景 | `--date-icon-filter` |
|---|---|---|---|
| dark（デフォルト） | `:root` | 暗い青系 | `invert(0.8)` |
| light | `[data-theme="light"]` | 明るい青系 | `opacity(0.5)` |
| warm | `[data-theme="warm"]` | 暗い茶系（アクセント色オレンジ系） | `invert(1) sepia(1) saturate(2) hue-rotate(350deg) opacity(0.85)` |

## 注意事項
- ヘルプガイド (`#guide-modal` in `index.html`) は大きな機能追加時に更新すること
- 返答は**日本語**で行うこと
- 「記録して」と言われた場合は **CLAUDE.md** に記載する（MEMORY.md はローカル専用のため Git 経由で別 PC に引き継がれない）
