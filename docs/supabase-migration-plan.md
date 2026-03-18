# Supabase 移行計画

## 目的
- Firestore の read 数最適化に時間を取られず、機能追加へ集中できるようにする
- 30人規模で使っても、日次 reads を気にし続ける運用から抜ける
- 既存の `GitHub Pages + Vanilla JS` は維持しつつ、DB を `Supabase` へ段階移行する
- ユーザー体験はなるべく維持する
  - ニックネームログインを継続
  - 招待コード
  - ログイン前 PIN（ロック済みユーザーのみ）

## 前提
- 以後の Supabase 操作は Codex 側で進める前提でステップを組む
- ただし、`project URL / anon key / service role key / dashboard でしか分からない値` は repo に保存しない
- 秘密値はローカル専用の `C:\Users\frx\.codex\memory.md` へ記録する
- Firebase はいきなり止めず、`画面単位` で Supabase に切り替える

## 今の Firestore 依存範囲

### 共有系
- `portal/config`
- `cards`
- `categories`
- `notices`
- `notice_reactions`

### 個人設定系
- `users_list`
- `users/{name}/data/preferences`
- `users/{name}/data/email_profile`
- `users/{name}/data/lock_pin`
- `users/{name}/data/section_order`
- `users/{name}/data/chat_reads`
- `users/{name}/data/drive_link`
- `users/{name}/data/drive_contacts`
- `users/{name}/private_sections`
- `users/{name}/private_cards`
- `users/{name}/todos`
- `users/{name}/read_notices`
- `users/{name}/attendance/{YYYY-MM-DD}`
- `users/{name}/email_contacts`

### 業務系
- `cross_dept_requests`
- `assigned_tasks`
- `attendance_sites`
- `orders`
- `order_suppliers`
- `order_items`
- `company_calendar`
- `public_attendance`
- `suggestion_box`

### リアルタイム/転送系
- `dm_rooms`
- `chat_rooms`
- `drive_shares`
- `p2p_signals`

## Supabase での方針

### 1. 最初は「DB 置換」を優先する
- 先に `読み書き先` を Firestore から Supabase へ移す
- 認証 UX の全面刷新は同時にやらない
- まずは現在の
  - 招待コード
  - ニックネーム入力
  - ロック PIN
  を保ちつつ移す

### 2. テーブルは「Firestore の見た目」ではなく「画面単位」でまとめる
- Firestore のコレクション構造をそのまま 1:1 で写すと SQL の強みが出にくい
- ただし初回移行では複雑化を避け、`なるべく素直なテーブル名` にする

### 3. 切替は 4 フェーズで行う
- `Phase A`: 共有系
- `Phase B`: 個人設定・プロフィール
- `Phase C`: 業務系
- `Phase D`: リアルタイム/転送系

## 推奨テーブル構成

### コア
- `portal_config`
- `departments`
- `user_accounts`
- `user_preferences`
- `user_profiles`
- `user_lock_pins`

### 共有スペース
- `public_categories`
- `public_cards`
- `notices`
- `notice_reactions`

### 個人スペース
- `private_sections`
- `private_cards`
- `user_todos`
- `user_notice_reads`
- `user_email_contacts`
- `user_chat_reads`
- `user_drive_links`
- `user_drive_contacts`

### 業務
- `cross_dept_requests`
- `assigned_tasks`
- `attendance_sites`
- `attendance_entries`
- `order_suppliers`
- `order_items`
- `orders`
- `company_calendar_settings`
- `public_attendance_months`
- `suggestion_box`

### 後回しにするもの
- `dm_rooms`
- `dm_messages`
- `chat_rooms`
- `chat_room_messages`
- `drive_shares`
- `p2p_signals`

## フェーズ別の実装順

### Step 0: Supabase プロジェクト準備
目的:
- 以後の SQL 実行先を決める
- 秘密値の扱いを固定する

やること:
1. Supabase プロジェクトを 1 つ作成
2. `project URL / anon key / service role key / project ref` をローカル専用メモへ保存
3. repo には `example` だけ置き、実値は置かない
4. `public schema` を使う方針で始める

完了条件:
- SQL editor に入れる状態
- 秘密値の保存場所が固定されている

### Step 1: SQL スキーマ作成
目的:
- Firestore の主要データを受ける入れ物を先に作る

やること:
1. `portal_config`
2. `departments`
3. `user_accounts / user_preferences / user_profiles / user_lock_pins`
4. `public_categories / public_cards / notices / notice_reactions`
5. `cross_dept_requests / assigned_tasks`
6. `attendance_sites / attendance_entries`
7. `order_suppliers / order_items / orders`

完了条件:
- 主要画面で必要なテーブルと index がそろう
- `created_at / updated_at` の基本ルールが決まる

### Step 2: フロントの DB アダプタ作成
目的:
- 既存モジュールが `Firebase API` に直結している状態を崩す

やること:
1. `modules/config.js` 直結をやめる設計にする
2. `modules/data/` か `modules/backend/` を新設する
3. まず `shared core` の read/write だけを wrapper 化する
4. `Firestore 実装` と `Supabase 実装` を差し替え可能にする

完了条件:
- 共有系の 1 画面を adapter 経由で動かせる

### Step 3: 共有系を Supabase へ切替
目的:
- 起動直後によく使う画面から Firestore を外す

対象:
- `portal/config`
- `categories`
- `cards`
- `notices`
- `notice_reactions`

完了条件:
- ホーム起動時に Firestore shared reads が発生しない
- 共有スペース、お知らせ、共有リンクが Supabase で動く

### Step 4: 個人設定系を Supabase へ切替
目的:
- ログイン直後の個人データを Supabase へ寄せる

対象:
- `users_list`
- `preferences`
- `email_profile`
- `lock_pin`
- `section_order`
- `private_sections`
- `private_cards`
- `todos`
- `read_notices`

完了条件:
- ニックネームログイン後の基本利用が Supabase だけで成立する

### Step 5: 業務系を Supabase へ切替
目的:
- 日常業務に直結するデータを Supabase へ移し、今後の機能追加基盤にする

対象:
- `cross_dept_requests`
- `assigned_tasks`
- `attendance_sites`
- `attendance_entries`
- `orders`
- `order_suppliers`
- `order_items`
- `company_calendar`
- `public_attendance`
- `suggestion_box`

完了条件:
- 勤怠、依頼、タスク、発注、物件Noまとめが Supabase で動く

### Step 6: チャット/転送系を最後に切替
目的:
- realtime と送受信の複雑さを最後に隔離する

対象:
- `dm_rooms`
- `chat_rooms`
- `drive_shares`
- `p2p_signals`

完了条件:
- realtime 部分を Supabase Realtime か代替方式で整理できる

## データ移行の実行方針
- 画面を Supabase 化する直前に、その機能分だけ Firestore から移す
- 一括フル移行はしない
- `JSON export -> SQL import` か `Node 移行スクリプト` を使う
- 本番切替前に `件数確認` と `画面表示確認` を必ず行う

## 切替時の確認項目
- PC幅
- スマホ幅
- 保存
- 閉じる
- 再表示
- 関連画面反映
- 転送診断
- 旧 Firestore 読込が残っていないか

## この計画で避けること
- 最初から全部を SQL に作り直す
- 認証刷新と DB 切替を同時にやる
- realtime を安易に先に移す
- Firestore を止めてから移植を始める

## 次の着手点
1. `Step 0`: Supabase 準備ルールを AGENTS に追記
2. `Step 1`: 初期 SQL スキーマ草案を `supabase/001_core_schema.sql` として作成
3. `Step 2`: shared core 用の DB adapter 設計を切る
