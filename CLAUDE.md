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
| `users/{name}/data/preferences` | 個人設定 |
| `users/{name}/data/lock_pin` | PINロック設定 |
| `users/{name}/private_sections/` | マイセクション |
| `users/{name}/private_cards/` | マイカード |
| `users_list/{name}` | ログイン記録・ニックネーム重複チェック |
| `portal/config` | 管理者PIN・Gemini APIキー等 |

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
