# Portal プロジェクト — Codex 引き継ぎメモ

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

---

## ⚡ リファクタリング不要開発ルール（コスト削減・最重要）

> **背景**: script.js が 6,000 行超のモノリスになり、モジュール分割リファクタリングに大きなコストが発生した。
> 同じ失敗を繰り返さないために、以下のルールを**すべての新機能・修正で必ず守ること**。

### 🏗️ ルール1: 新機能は最初から `modules/` に作る

```
✅ 正しい: modules/new-feature.js を新規作成して実装
❌ NG:     script.js に直接コードを追記する
```

- 新機能が小さくても `modules/` に独立ファイルとして作成する
- script.js はエントリポイント（import + イベントリスナー）のみ。ロジックは書かない
- **目安**: 機能が 30 行を超えそうなら迷わずモジュール化する

### 📦 ルール2: モジュールのフォーマットを統一する

```js
// modules/xxx.js の必須構造
import { state } from './state.js';
import { db, ... } from './config.js';
import { esc } from './utils.js';

let deps = {};
export function initXxx(d) { deps = d; }  // 外部依存はすべて deps 経由

export function xxxFunction() { ... }
```

- 他モジュールの関数が必要な場合は **deps 経由** で受け取る（循環 import 防止）
- deps の設計（何を受け取るか）は**実装前に先に決める**

### 🗂️ ルール3: state.js を先に更新する

- 新機能で状態変数が必要になったら、コーディング前に `state.js` に追加する
- state.js に定義せずモジュール内に `let` を書くと、後で共有が必要になったときに大改修が発生する
- **原則**: 2つ以上のモジュールで参照する可能性がある変数はすべて `state.js` に入れる

### 🗄️ ルール4: Firestore 設計を先に AGENTS.md に記録する

- 新機能のコレクション名・フィールド名は**実装前に AGENTS.md の「Firestore コレクション一覧」に追記**する
- 後からフィールドを追加すると既存データとの整合性が崩れ、マイグレーションコストが発生する
- フィールド追加でも事前にここに記録しておく

### 🎨 ルール5: CSS クラスは再利用・追加は末尾に集約

- 新 UI を作る前に style.css の既存クラスを確認し、流用できるものは流用する
- 新しい CSS は**対応するモジュール名をコメントで明示**して style.css 末尾付近に追記
- 1 UI = 1 セクション（`/* ===== 機能名 ===== */` でブロック化）

### 📐 ルール6: HTML 要素 ID はモジュールプレフィックス付き

| モジュール | ID プレフィックス | 例 |
|---|---|---|
| file-transfer.js | `ft-` | `ft-drive-area` |
| chat.js | `chat-` | `chat-panel` |
| tasks.js | `task-` | `task-modal` |
| notices.js | `notice-` | `notice-list` |
| auth.js | `auth-` / `lock-` | `lock-screen` |
| calendar.js | `cal-` | `cal-modal` |
| 新機能 XYZ | `xyz-` | `xyz-modal` |

- プレフィックスなしの ID は禁止（他機能との衝突リスク）

### 🔄 ルール7: 1機能1コミット・機能追加とリファクタを混ぜない

```
✅ 正しいコミット例:
  feat: タスク割り振り機能を追加
  fix: Drive共有の開くボタンが自分のURLを開くバグを修正
  style: チャットパネルのホバー色をCSS変数化

❌ NGなコミット例:
  いろいろ修正（機能追加＋スタイル修正＋リファクタが混在）
```

- 機能追加・バグ修正・スタイル改善・リファクタは**別々のコミット**にする
- 「ついでに整理しておこう」という衝動を抑える

### ⚠️ ルール8: 大きな変更前に設計を提案する

- 複数ファイルにまたがる変更、または既存モジュールの大幅修正が必要な場合は
  **実装前に「この方針で進めます」と変更概要を提示してからコーディングする**
- ユーザーの承認なしに大規模リライトは行わない

---

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
| `notices/` | お知らせ（priority / targetScope / targetDepartments で全体/部署向け配信） |
| `notice_reactions/{noticeId}` | リアクション |
| `chat_messages/` | 全社チャット（廃止予定） |
| `users/{name}/data/preferences` | 個人設定（lastViewedSuggestionsAt を含む） |
| `users/{name}/data/email_profile` | 個人プロフィール（署名・所属部署・役割） |
| `users/{name}/data/lock_pin` | PINロック設定 |
| `users/{name}/private_sections/` | マイセクション |
| `users/{name}/private_cards/` | マイカード |
| `users_list/{name}` | ログイン記録・ニックネーム重複チェック |
| `portal/config` | 管理者PIN・招待コード・Gemini APIキー・departments[]・suggestionBoxViewers[] |
| `cross_dept_requests/` | 部門間依頼（部署→部署の課題・お願い） |
| `suggestion_box/` | 目安箱（全員投稿可、閲覧は管理者のみ） |
| `assigned_tasks/` | タスク割り振り（sharedWith/sharedResponses で共有機能あり） |
| `users/{name}/attendance/{YYYY-MM-DD}` | 個人勤怠（完全プライベート）|
| `attendance_sites/` | 勤務内容表で使用する登録現場マスタ（コード・現場名） |
| `order_suppliers/` | 発注先マスタ |
| `order_items/` | 鋼材マスタ（品名・規格・単位・デフォルト数量） |
| `orders/` | 発注履歴（明細・送信状態・20日締め管理・ソフト削除復元） |

### 発注履歴フィールド（`orders/{orderId}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `supplierId` | string | 発注先ID |
| `supplierName` | string | 発注先名 |
| `supplierEmail` | string | 発注先メールアドレス |
| `orderType` | string | `'factory'` / `'site'` |
| `siteName` | string\|null | 現場名発注時の現場名 |
| `projectKey` | string | 物件No（現場コード）を入れる共通キー（未設定時は空文字） |
| `items` | array | 発注明細 |
| `orderedBy` | string | 発注者ニックネーム |
| `note` | string | 備考 |
| `orderedAt` | timestamp | 発注日時 |
| `emailSent` | boolean | メール送信済みフラグ |
| `emailSentAt` | timestamp\|null | メール送信日時 |
| `deletedAt` | timestamp\|null | 履歴を削除した日時（`null` なら表示対象） |
| `deletedBy` | string\|null | 履歴を削除したユーザー名 |

- **保持ポリシー（2026-03 追加）**: `orders/` は通常履歴を1年保持し、`deletedAt` が入った削除済み履歴は30日を過ぎたらフロント側クリーンアップで完全削除する。

### 部門間依頼フィールド（`cross_dept_requests/{requestId}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `title` | string | 依頼タイトル |
| `projectKey` | string | 物件No（現場コード）を入れる共通キー（未設定時は空文字） |
| `toDept` | string | 依頼先部署 |
| `fromDept` | string | 依頼元部署 |
| `content` | string | 依頼本文 |
| `proposal` | string | 対策・提案 |
| `remarks` | string | 備考 |
| `status` | string | `'submitted'` / `'reviewing'` / `'accepted'` / `'rejected'` |
| `createdBy` | string | 投稿者ニックネーム |
| `createdAt` | timestamp | 投稿日時 |
| `updatedAt` | timestamp | 最終更新日時 |
| `archived` | boolean | アーカイブ済みフラグ |
| `statusNote` | string | ステータス更新コメント |
| `statusUpdatedBy` | string | ステータス更新者ニックネーム |
| `notifyCreator` | boolean | 依頼元への通知フラグ |
| `linkedTaskId` | string\|null | 依頼から起票した関連タスクID |
| `linkedTaskStatus` | string\|null | `'pending'` / `'accepted'` / `'done'` / `'cancelled'` |
| `linkedTaskAssignedTo` | string\|null | 関連タスクの担当者ニックネーム |
| `linkedTaskLinkedAt` | timestamp\|null | タスク化した日時 |
| `linkedTaskLinkedBy` | string\|null | タスク化したユーザーニックネーム |
| `linkedTaskClosedAt` | timestamp\|null | 関連タスクが完了/取消になった日時 |

### タスク追加フィールド（`assigned_tasks/{taskId}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `sourceType` | string | `'manual'` / `'cross_dept_request'` |
| `projectKey` | string | 物件No（現場コード）を入れる共通キー（未設定時は空文字） |
| `sourceRequestId` | string\|null | 元になった部門間依頼ID |
| `sourceRequestFromDept` | string\|null | 元依頼の依頼元部署 |
| `sourceRequestToDept` | string\|null | 元依頼の依頼先部署 |

### 個人プロフィールフィールド（`users/{name}/data/email_profile`）
| フィールド | 型 | 説明 |
|---|---|---|
| `realName` | string | 本名・署名名 |
| `department` | string | 所属部署 |
| `roleType` | string | `'member'` / `'leader'` / `'manager'` |
| `email` | string | メールアドレス |
| `phone` | string | 電話番号 |
| `signatureTemplate` | string | メール署名テンプレート |
| `updatedAt` | timestamp | `serverTimestamp()` |

### 勤怠データフィールド（`users/{name}/attendance/{YYYY-MM-DD}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `type` | string\|null | `null`=通常 / `'有給'` / `'半休午前'` / `'半休午後'` / `'欠勤'` |
| `hayade` | string\|null | 早出時刻（例: `"07:30"`）|
| `zangyo` | string\|null | 残業時刻（例: `"19:00"`）|
| `note` | string\|null | メモ |
| `workSiteHours` | map | その日の現場別工数（`{ [siteId]: number }`、単位:h） |
| `projectKeys` | array | その日に関係する物件No配列（現場コード、重複なし） |
| `yearMonth` | string | `'YYYY-MM'`（月別クエリ用インデックス）|
| `updatedAt` | timestamp | `serverTimestamp()` |

- **保持ポリシー（2026-03 追加）**: `users/{name}/attendance/` はフロント側で週1回クリーンアップし、180日より古い日付ドキュメントを自動削除する。

## セキュリティ
- Firestore セキュリティルールなし（ユーザー名を知らないと個人データにアクセスできない「obscurity」方式）
- 管理者PIN: `portal/config.pinHash`（SHA-256ハッシュ）
- 招待コード: `portal/config.inviteCodeHash`（4桁コードの SHA-256 ハッシュ。URL直打ちの覗き見防止用）
- 個人PINロック: `users/{name}/data/lock_pin.hash`
- ログイン前PIN確認: `users/{name}/data/lock_pin.enabled === true` かつ `hash` があるユーザーのみ、ユーザー名入力後にログイン前PINを要求する

### `portal/config` フィールドメモ
| フィールド | 型 | 説明 |
|---|---|---|
| `pinHash` | string\|null | 管理者PINの SHA-256 ハッシュ |
| `inviteCodeHash` | string\|null | 4桁招待コードの SHA-256 ハッシュ |
| `inviteUpdatedAt` | timestamp\|null | 招待コードの更新日時 |
| `departments` | string[] | 部署一覧 |
| `suggestionBoxViewers` | string[] | 目安箱の閲覧許可ユーザー |
| `missionText` | string | トップの方針テキスト |

## Firestore 読み取り超過 再発防止ルール

> **目的**: Spark 無料枠（読み取り 5万/日）を超えないようにし、30人規模でも無料運用を維持しやすくする。

### ルールA: ログイン前・招待コード前に Firestore の公開読込を始めない
- `portal/config` の招待設定確認より前に `subscribeNotices()` や `subscribeCards()` などの常時読込を始めない
- 「URLを知っているだけの未認証状態」で Firestore listener を立てる変更は禁止

### ルールB: 常時 listener は「今日使うもの」だけ
- ログイン直後に自動起動してよい realtime listener は、ダッシュボードや通知など**常時見る必要がある軽いものだけ**
- `chat / file-transfer / drive / users_list` のような重い機能は **開いた時だけ** 読む
- 新機能で `onSnapshot` を使う前に、「本当に realtime 必須か」を先に検討する

### ルールC: 履歴・集計・全社横断は手動実行を基本にする
- 完了済み履歴、アーカイブ、月次集計、`collectionGroup()` を使う横断集計は初期表示で自動実行しない
- 「タブを開いた時だけ `getDocs()`」「集計ボタンを押した時だけ実行」を基本にする

### ルールD: 新しい読込は診断対象に含める
- 新しい `getDocs()` / `onSnapshot()` / 重い `getDoc()` を追加したら、`read-diagnostics` でも追えるようにする
- 少なくとも「どの画面を開くと何を読むか」は後から見える状態を維持する

### ルールE: 管理画面でも全件読込を安易に増やさない
- 管理者向け一覧は `getDocs()` 1回読込を基本にし、不要な realtime 化をしない
- 全ユーザー一覧や重い設定一覧をモーダルを開くたびに複数回読み直さない

### ルールF: 実装後は PC / スマホの両方で確認する
- 表示確認だけでなく `保存 → 閉じる → 再表示 → 関連画面反映` まで見る
- 読み取り削減の変更後は `読取診断` を見て、起動直後に不要 listener が立っていないか確認する

## 🔧 積み残しタスク（優先度順）

### ① style.css のハードコード色を CSS変数に全置換（未着手）
**背景**: ダークモード開発時に `rgba(255,255,255,0.xx)` を直書きした箇所が多数残っており、
ライトモードで「白+白=消える」バグの温床になっている。
見つかるたびに個別修正しているが、根本解決のため一括対応が必要。

**作業内容**:
1. `style.css` 内の `rgba(255,255,255,0.xx)` を全検索
2. 用途に応じて以下の変数に置き換える：
   - 背景系: `var(--bg-glass)` / `var(--bg-card)` / `var(--bg-card-hover)`
   - ボーダー系: `var(--border-glass)` / `var(--border-glass-hover)`
3. ライトモード専用オーバーライドが不要になった箇所は削除してスリム化

**注意**: 大規模変更になるため、1機能ブロックずつコミットして確認しながら進める。

---

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
  - title           : タスク名
  - description     : 詳細
  - assignedBy      : 依頼者ニックネーム
  - assignedTo      : 担当者ニックネーム
  - status          : 'pending'（承諾待ち）| 'accepted'（進行中）| 'done'（完了）
  - createdAt       : 作成日時
  - acceptedAt      : 承諾日時
  - doneAt          : 完了日時
  - dueDate         : 期限（任意）
  - notifiedDone    : 完了通知済みフラグ
  - sharedWith      : string[]  — タスクを共有した追加ユーザー名配列（初期値: []）
  - sharedResponses : { [username]: 'pending' | 'accepted' | 'declined' }
                      — 共有先の各ユーザーの応答（初期値: {}）
```

**共有機能フロー**
- 依頼者が「依頼したタスク」タブで「共有」ボタン → 共有ピッカーでユーザーをチェックボックスで複数選択
- updateDoc で sharedWith に追加・sharedResponses に 'pending' をセット
- 共有された側は「共有されたタスク」タブ（3つ目のタブ）に表示される
- 「受け取る」→ sharedResponses[username] = 'accepted'
- 「断る」→ sharedResponses[username] = 'declined'
- バッジカウント: 未応答（pending）の共有タスク数を加算

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
- **ライトモードで `--bg-glass` をそのまま入力欄に使うと白飛びする** → `.form-input` はライト時 `background: #ffffff` + `border-color: rgba(31,35,40,0.28)` が定義済み（CSS変数のみで十分。追加上書き不要）

### ⚠️ ライトモード入力欄の白飛び防止（既発生バグ・再発防止）
**背景**: `--bg-glass: rgba(255,255,255,0.90)` と `--border-glass: rgba(31,35,40,0.12)` は白背景モーダル上では視認不能。

**対策として以下を style.css に定義済み**:
- `[data-theme="light"] .modal-glass` → `background: rgba(241,243,247,0.98)` （薄いグレー背景）
- `[data-theme="light"] .form-input` → `background: #ffffff` + `border-color: rgba(31,35,40,0.28)` （白＋くっきりボーダー）
- `--border-glass` をライト時 `0.25` に強化

**新規モーダルを作るときの注意**:
- `modal-glass` クラスを使えばライト対応は自動。
- 入力欄は `.form-input` クラスを使えば自動。
- **独自入力クラスを作る場合（例: `.email-profile-prompt-area`）は `[data-theme="light"]` オーバーライドをセットで追加すること。** 忘れると白飛びする（既発生済み）。
- 入力欄の背景は `var(--bg-glass)` / `var(--bg-card)` を使う。`rgba(255,255,255,0.xx)` のハードコードは禁止。

### ボタンクラス対応表
| 用途 | 正しいクラス |
|---|---|
| キャンセル・閉じる | `.btn-modal-secondary` |
| 主要アクション（送信・保存） | `.btn-modal-primary` |
| 危険操作（削除） | `.btn-modal-danger` / `.btn-danger` |

### アクセント色の注意
ライトモードでは `--accent-blue` が暗め（`#0969da`）に再定義されている。
ホバー背景に `rgba(74,158,255,0.xx)` をハードコードすると**ライトモードで色が合わない**。
必ず `var(--accent-blue)` または `color-mix()` を使うこと。

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

## カラーデザインシステム（WCAG 2.1 AA 準拠）

> **調査元**: GitHub Design System / Material Design 3 / WCAG 2.1 Success Criteria 1.4.3 (4.5:1) ＋ 1.4.11 (3:1)

### 設計方針
- **純粋な黒・白は使わない**: `#000` / `#fff` はハレーション・眼精疲労の原因。ダークは深いネイビー系、ライトはオフホワイト系を使う
- **コントラスト比**: 本文テキスト ≥ 4.5:1、大テキスト・UIコンポーネント ≥ 3:1
- **セマンティックトークン**: 用途（背景・テキスト・アクセント）ごとに変数を分け、色そのものでなく役割を参照する
- **アクセント色はモードで変える**: ダークモードは明るめ（`#58a6ff`）、ライトモードは暗め（`#0969da`）を使うことで両方で WCAG AA を満たす

### テーマ一覧（2 テーマのみ）
| テーマ | セレクタ | 背景ベース | `--date-icon-filter` |
|---|---|---|---|
| dark（デフォルト） | `:root` | `#0d1117`（深いネイビー） | `invert(0.8)` |
| light | `[data-theme="light"]` | `#f6f8fa`（オフホワイト） | `brightness(0) opacity(0.55)` |

### CSS 変数一覧（ダーク / ライト）

| 変数 | ダーク | ライト | 用途 |
|---|---|---|---|
| `--bg-primary` | `#0d1117` | `#f6f8fa` | ページ背景 |
| `--bg-secondary` | `#161b22` | `#eaeef2` | パネル・モーダル背景 |
| `--bg-card` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.95)` | カード・インタラクティブ要素 |
| `--bg-card-hover` | `rgba(255,255,255,0.09)` | `rgba(255,255,255,1)` | ホバー背景 |
| `--bg-glass` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.90)` | ガラス効果背景 |
| `--border-glass` | `rgba(255,255,255,0.10)` | `rgba(31,35,40,0.12)` | 通常ボーダー |
| `--border-glass-hover` | `rgba(255,255,255,0.25)` | `rgba(31,35,40,0.35)` | ホバーボーダー |
| `--text-primary` | `#e6edf3` | `#1f2328` | メインテキスト（コントラスト比 ~14:1 / ~17:1） |
| `--text-secondary` | `rgba(230,237,243,0.65)` | `rgba(31,35,40,0.70)` | サブテキスト（~9:1 / ~12:1） |
| `--text-muted` | `rgba(230,237,243,0.40)` | `rgba(31,35,40,0.46)` | 薄いテキスト（~5.5:1 / ~7.5:1） |
| `--accent-blue` | `#58a6ff` | `#0969da` | 主要アクセント色 |
| `--accent-cyan` | `#39d0b5` | `#0a7fc0` | セカンダリアクセント |
| `--accent-purple` | `#bc8cff` | `#6639ba` | 三次アクセント |
| `--accent-orange` | `#ffa657` | `#bc4c00` | 警告・注意 |
| `--accent-pink` | `#ff7eb6` | `#bf3989` | 特殊アクセント |

## 注意事項
- ヘルプガイド (`#guide-modal` in `index.html`) は大きな機能追加時に更新すること
- 返答は**日本語**で行うこと
- 「記録して」と言われた場合は **AGENTS.md** に記載する（MEMORY.md はローカル専用のため Git 経由で別 PC に引き継がれない）
