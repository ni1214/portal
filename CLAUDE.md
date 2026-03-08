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
| `applications/` | 申請フォーム |
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

## 注意事項
- ヘルプガイド (`#guide-modal` in `index.html`) は大きな機能追加時に更新すること
- 返答は**日本語**で行うこと
