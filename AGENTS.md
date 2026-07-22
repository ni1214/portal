# Portal プロジェクト — Codex 引き継ぎメモ

## プロジェクト概要
- **名前**: 生産管理課 ポータル
- **公開先**: GitHub Pages (`https://github.com/ni1214/portal.git` / branch: `master`)
- **バックエンド**: Supabase（runtime / 本番 primary） / Firebase は移行スクリプト専用
- **スタック**: Vanilla JS (ES modules) + HTML + CSS — フレームワークなし
- **主要ファイル**: `index.html` / `script.js` / `style.css`

## 開発方針（重要）
- **基本方針**: GitHub Pages + Supabase Free の範囲内で実装する
- バックエンド処理が必要になっても、まず「Supabase / フロントで代替できないか」を先に検討する
- Vercel等に切り替えればより良い方法がある場合は「Vercelに切り替えれば〇〇もできます」と**条件付きで提案するだけ**にする
- ユーザーはVercel等への移行を現時点では望んでいない

## Claude Code 役割の Codex 対応表
> **目的**: Claude Code 側で使っている常設エージェント名を、Codex では `spawn_agent` / `explorer` / `worker` / `web` に読み替えて運用する。

| Claude Code の役割 | Codex での対応 | 使い分けの目安 |
|---|---|---|
| 🎯 **指揮官 (Commander)** | メインの Codex が進行管理 | ユーザー要件の解釈、タスク分割、割り当て、進行管理を担当する |
| 🔍 **監査エージェント (Auditor)** | `explorer` かレビュー用の sub-agent | 古い CSS クラス、重複要素、デッドコードの洗い出しに使う |
| 📐 **リサーチエージェント (Researcher)** | `web` を使う調査担当の sub-agent | 最新 UI トレンド、Google / Material Design などの調査に使う |
| ⚒️ **実装エージェント (Implementer)** | `worker` | HTML / CSS / JS の新機能追加や UI 修正を担当する |
| 🧐 **批評エージェント (Critic)** | レビュー用 sub-agent かメインのセルフレビュー | 実装後の問題点、抜け、改善案を指摘する |
| 🐛 **バグファインダー (Bug Finder)** | 実機確認担当の sub-agent | ブラウザ操作、クリック確認、コンソールエラー確認を担当する |
| 🔧 **バグフィクサー (Bug Fixer)** | `worker` | バグファインダーの報告を受けてコードを修正する |
| 👀 **UXレビュアー (UX Reviewer)** | レビュー用 sub-agent | 初見ユーザー視点で 10 秒以内に理解できるかを見る |
| 🎨 **UIビューティエージェント (Beauty Inspector)** | レビュー用 sub-agent | 余白、整列、間隔、色、タイポグラフィの粗を見つける |
| ✨ **UIビューティフィクサー (Beauty Fixer)** | `worker` | Beauty Inspector の指摘を受けて CSS を修正する |
| 🔄 **再発防止エージェント (Prevention Agent)** | メインの文書更新作業 | 同じミスが再発しないよう `AGENTS.md` や関連メモへルールを追記する |
| 📱 **レスポンシブチェッカー (Responsive Checker)** | 実機確認担当の sub-agent | mobile / tablet / desktop の 3 サイズで崩れを確認する |

- Codex では Claude Code のような「常設の個別エージェント名」は持たず、必要な時に役割単位で `spawn_agent` する
- レビュー系は `explorer` を優先し、実装系は `worker`、調査系は `web` を優先する
- 役割を複数同時に使う場合は、作業範囲が重ならないように分担する

---

## 2026-05-26 最新方針（レスポンシブ・ワークスペース UI）

> **重要**: 古い Stitch 前提のデザイン運用は廃止。今後は Portal 側で、モーダル中心ではない本体ビュー切り替え式ワークスペース UI へ段階移行する。

### 現在の大方針
- PC 全画面、PC 半分幅、スマホ幅で自然に操作できるワークスペース UI を優先する
- 主要機能はポータル本体の中で画面切り替えする
- モーダルは確認、短い編集、ユーザーピッカーなど補助用途に限定していく
- 既存の `id` / `data-*` / Supabase データ構造は壊さない
- 古い UI 専用 CSS、重複 DOM、未使用コードは機能単位の移行後に削除する

### 推奨着手順
1. ワークスペース基盤
2. 部門間依頼
3. タスク管理
4. 勤怠カレンダー
5. 発注
6. 共有リンク
7. メールアシスタント / プロフィール
8. チャット / ファイル転送
9. 旧コード整理と Firebase runtime 名残の削除

### 確認条件
- `PC幅 1440px`、PC 半分幅、`スマホ幅 390px`
- `light` と `dark`
- 横スクロールなし
- `保存 → 閉じる → 再表示 → 関連画面へ反映`
- コンソール `error` / `SEVERE` 0 件

### 共通 UI 再発防止
- ワークスペース共通ヘッダーは、業務画面より目立つカードや帯にしない。背景は透明または薄い境界線までに抑える。
- `Responsive` など実装都合の英語ラベルは画面上に出さない。ユーザーに見える文言は業務上必要な日本語にする。
- ホームへ戻るボタンは戻る導線として控えめにし、現在画面の主役に見える強い塗り・影・装飾を避ける。
- 各機能の先頭見出しは、モーダル由来の濃い背景帯をそのまま残さない。ワークスペース内では透明背景 + 下線程度にする。
- 機能移行後は `Responsive` / `viewport` / 英語の装飾ラベルが見えていないか確認する。

### Firebase 完全撤去
- runtime 本線は Supabase
- Firebase / Firestore の記述は移行履歴として残っている箇所がある
- UI ワークスペース移行と並行して、Firebase SDK / request / コメント / 旧分岐の不要箇所を機能単位で削る
- 2026-06-02 時点で `script.js` / `modules/` / `index.html` / `style.css` の Firebase / Firestore 文言は整理済み。以後は `docs/` や `tools/build-firestore-*.mjs` などの移行履歴・移行ツールだけを例外として扱う。

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

### 🗄️ ルール4: Supabase 設計を先に AGENTS.md に記録する

- 新機能のテーブル名・フィールド名は**実装前に AGENTS.md のデータ設計メモへ追記**する
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
- ユーザーに止められていない限り、**実装完了時は commit と push まで行う前提**で進める
- 新規チャットでも同様に、変更を残す場合は `master` への push まで完了させる

## アーキテクチャ
- 現在の runtime 本線は **Supabase**。以下の Firebase / Firestore 記述は、主に移行履歴・旧パス対応の参照メモとして残っている
- `script.js` は `type="module"` — ESM import 構文必須
- runtime は `modules/supabase.js` の REST helper を本線で使う。リアルタイム相当が必要な箇所は機能ごとに polling / 再取得で補う
- **常時編集モード**: `isEditMode = true` 固定（PIN ゲートなし）

## ユーザー識別（Googleログイン + username互換）
- 2026-06-22 以降の入口は **Supabase Auth の Google OAuth** を基本にする。
- 既存データ互換のため、runtime の個人データキーは引き続き `state.currentUsername` / `user_accounts.username` を使う。
- Google アカウント情報は `user_accounts.google_auth_id` / `google_email` / `google_name` / `google_avatar_url` に紐付ける。
- 初回 Google ログイン時は、ポータル内表示名（`username`）を作成する。既存データを引き継ぐ場合は、これまでの `username` を入力して Google アカウントにリンクする。
- 旧 `localStorage('portal-username')` は自動ログインの正としない。Google セッションがない場合は復元せず、Googleログインへ誘導する。
- `currentUsername` 変数で管理。`loadPersonalData(username)` で個人 Supabase データを読み込む。
- 本番反映前に Supabase Dashboard の Google provider を有効化し、Google Cloud OAuth の Authorized JavaScript origins / redirect URI を設定すること。未設定のまま push するとログインできない。

## 個人設定の保存先
- **Supabase が正**: `user_preferences`（theme / fontSize / favOnly / favorites[] / lastViewedSuggestionsAt など）
- `localStorage` はフラッシュ防止キャッシュのみ

## Firestore コレクション一覧
> **注記**: ここは旧 Firebase / Firestore 時代のデータ対応表を兼ねる。現在の本線保存先は Supabase。

| コレクション | 用途 |
|---|---|
| `cards/` | 公開カード |
| `categories/` | 公開カテゴリ |
| `notices/` | お知らせ（priority / targetScope / targetDepartments / requireAcknowledgement / acknowledgedBy で配信・確認管理） |
| `notice_reactions/{noticeId}` | リアクション |
| `chat_messages/` | 全社チャット（廃止予定） |
| `users/{name}/data/preferences` | 個人設定（lastViewedSuggestionsAt を含む） |
| `users/{name}/data/email_profile` | 個人プロフィール（署名・所属部署・役割） |
| `users/{name}/data/lock_pin` | PINロック設定 |
| `users/{name}/private_sections/` | マイセクション |
| `users/{name}/private_cards/` | マイカード |
| `users_list/{name}` | ログイン記録・ニックネーム重複チェック |
| `portal/config` | 管理者PIN・Gemini APIキー・departments[]・suggestionBoxViewers[] |
| `cross_dept_requests/` | 部門間依頼（部署→部署の課題・お願い） |
| `suggestion_box/` | 目安箱（全員投稿可、閲覧は管理者のみ） |
| `assigned_tasks/` | タスク割り振り（sharedWith/sharedResponses で共有機能あり） |
| `users/{name}/attendance/{YYYY-MM-DD}` | 個人勤怠（完全プライベート）|
| `attendance_sites/` | 勤務内容表で使用する登録現場マスタ（コード・現場名） |
| `order_suppliers/` | 発注先マスタ |
| `order_items/` | 鋼材マスタ（品名・規格・単位・デフォルト数量） |
| `orders/` | 発注履歴（明細・送信状態・20日締め管理・ソフト削除復元） |

### 共有リンク追加フィールド（`public_cards` / `private_cards`）
| フィールド | 型 | 説明 |
|---|---|---|
| `description` | string | Drive風カード/リストで表示する短い説明 |
| `thumbnailUrl` | string | 任意のサムネイル画像URL。未設定時はリンク種別アイコンで代替 |
| `linkType` | string | `'site'` / `'spreadsheet'` / `'document'` / `'presentation'` / `'form'` / `'pdf'` / `'image'` / `'folder'` / `'other'` |
| `tags` | string[] | 検索用タグ |
| `lastOpenedAt` | timestamp\|null | 最後に開いた日時 |
| `openCount` | number | 開いた回数 |
| `updatedBy` | string | 公開カードの最終更新者 |

- 共有リンクは Google Drive 風のグリッド/リスト表示を持つ。サムネイル表示はユーザーごとに ON/OFF 保存する。
- GitHub Pages 運用のため、外部ページのサムネイル自動スクレイピングは本線にしない。任意の `thumbnailUrl` とリンク種別アイコンで代替する。

### 共有リンク UI の再発防止（2026-07）
- 共有リンクは検索を主操作にし、`すべて / お気に入り`、カテゴリ、グリッド/一覧を同じワークスペース内で切り替える。別画面や大きなモーダルへ分けない。
- 上部は検索と新規追加を優先し、件数表示は簡潔にする。AI追加は補助機能として折りたたみ、リンク一覧より前で大きな面積を占有させない。
- `lastOpenedAt` / `openCount` は公開カードの共有フィールドであり、ユーザー個人の利用履歴ではない。個人履歴の保存設計を追加するまでは「最近使った順」として表示・更新しない。
- 一覧表示でも関連リンクを省略しない。親リンクの直後へ子リンクをインデント表示し、グリッドでは展開時に親と関連リンク領域を全幅にする。
- スマホ幅はグリッド2列を基本とし、プレビュー・リンク名・操作ボタンの重なりとページ全体の横スクロールがないことを確認する。
- 保存・描画できるリンク先は `http://` / `https://` と明示的なポータル内アクションだけに限定する。`javascript:` / `data:` などは既存データを含めて開かない。

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

### 鋼材発注 UI の再発防止（2026-07）
- 鋼材発注はポータル本体の1ワークスペース内で、`発注を作成 / 発注履歴 / 設定`を切り替える。確認・履歴・詳細・設定を独立した大型モーダルへ戻さない。
- 発注作成の表示順は常に`発注条件 → 品目を選ぶ → 発注内容`とする。狭い画面でも発注内容を品目一覧より前へ並べない。
- マスタ外品目と選択済み品目の数量は、検索・素材・カテゴリの絞り込みを変更しても保持する。送信前の確認画面からは入力内容を失わずに戻れるようにする。
- 発注履歴はタブを開いた時だけ取得し、ホーム初期表示では読み込まない。履歴詳細からEscまたは戻る操作で履歴一覧へ一段戻れるようにする。
- `1440px / PC半分幅 / 390px`と`light / dark`で、発注条件、フィルター、品目行、発注内容に横スクロールがないことを確認する。

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

### Googleログイン追加フィールド（`user_accounts/{username}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `googleAuthId` | string\|null | Supabase Auth の Google ユーザーID（`auth.users.id`） |
| `googleEmail` | string | Googleアカウントのメールアドレス（小文字） |
| `googleName` | string | Googleプロフィール名 |
| `googleAvatarUrl` | string | Googleプロフィール画像URL |
| `loginProvider` | string | `'google'` / 旧互換 `'nickname'` |
| `lastGoogleLoginAt` | timestamp\|null | Googleログイン確認日時 |

### トラブル報告フィールド（`trouble_reports/{reportId}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `reportDate` | date | 発生日 |
| `reporterUsername` | string | 報告者のポータル表示名 |
| `reporterEmail` | string | Googleまたはプロフィールのメールアドレス |
| `department` | string | 報告者部署 |
| `mistakeType` | string | ミス先（`'現場ミス'` / `'設計ミス'` / `'展開ミス'` / `'工場ミス'` / `'工事ミス'` / `'外注ミス'` / `'その他'`） |
| `projectKey` | string | 物件No（現場コード）。`attendance_sites.code` と同じキー |
| `siteId` | string\|null | `attendance_sites.id`。物件Noマスタとリンクできた場合に保存 |
| `title` | string | 件名（現場名） |
| `occurrenceLocation` | string | 符号と発生場所 |
| `detail` | string | 事象（何が起きたか） |
| `cause` | string | 原因分析（なぜ起きたか） |
| `correctiveAction` | string | 対処策（どう対処したか） |
| `preventionAction` | string | 再発防止策 |
| `keywords` | string | 検索・AI参照用キーワード（例: `#焼付 #付枠`） |
| `status` | string | `'submitted'` / `'reviewing'` / `'done'` / `'archived'` |
| `assignee` | string | 対応担当者 |
| `adminNote` | string | 管理・対応メモ |
| `createdAt` | timestamp | 投稿日時 |
| `updatedAt` | timestamp | 更新日時 |

- トラブル報告の現場名は `attendance_sites` を物件Noマスタとして参照する。未登録の物件Noはトラブル報告画面から `attendance_sites` に登録/更新できる。
- キーワードはフォーム入力から自動生成し、必要に応じて手入力で上書きできる。
- 自然言語入力欄は入力補助専用で、入力文そのものは `trouble_reports` に保存しない。Gemini APIキーが設定済みならAI解析で項目へ反映し、未設定または失敗時はフロント側の簡易解析で分かる範囲だけ反映する。

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
- runtime は Supabase。本番で Firebase セキュリティルールは使っていない。アクセス制御は Supabase 側の設定を前提に整理する
- 管理者PIN: `portal/config.pinHash`（SHA-256ハッシュ）
- 招待コード機能は 2026-06-23 に廃止。入口制御は Supabase Auth の Googleログインに一本化する。
- 個人PINロック: `users/{name}/data/lock_pin.hash`
- ログイン前PIN確認: `users/{name}/data/lock_pin.enabled === true` かつ `hash` があるユーザーのみ、ユーザー名入力後にログイン前PINを要求する

### `portal/config` フィールドメモ
| フィールド | 型 | 説明 |
|---|---|---|
| `pinHash` | string\|null | 管理者PINの SHA-256 ハッシュ |
| `departments` | string[] | 部署一覧 |
| `suggestionBoxViewers` | string[] | 目安箱の閲覧許可ユーザー |
| `missionText` | string | トップの方針テキスト |

### お知らせフィールド（`notices/{noticeId}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `title` | string | タイトル |
| `body` | string | 本文 |
| `priority` | string | `'normal'` / `'urgent'` |
| `targetScope` | string | `'all'` / `'departments'` |
| `targetDepartments` | string[] | 配信対象部署 |
| `requireAcknowledgement` | boolean | `true` の場合は「確認した」操作が必要 |
| `acknowledgedBy` | string[] | 確認したユーザー名の一覧 |
| `createdAt` | timestamp | 作成日時 |

## Supabase 転送量超過 再発防止ルール

> **目的**: Supabase Free の転送量 5GB/月を意識しながら、30人規模でも無料運用を維持しやすくする。
> **補足**: runtime 本線は Supabase。Firebase / Firestore は移行履歴・移行スクリプトの参照名として残るだけなので、新規実装で fallback や並行書込みを増やさない。

### ルールA: ホーム初期表示で大きい一覧を自動読込しない
- ログイン直後やホーム表示時に、全件リンク集・履歴・集計結果をまとめて自動取得しない
- 必要なら `ボタンを押した時だけ` `タブを開いた時だけ` `検索した時だけ` 読む
- 共有スペースやダッシュボードは「要点だけ先に表示」「重い一覧は後から開く」を基本にする

### ルールB: realtime / listener は軽い常用データだけ
- 常時購読してよいのは、通知・今日のタスク・当日勤怠など「常時見る軽いもの」だけ
- `chat / file-transfer / drive / users_list / 集計` のような重い機能は **開いた時だけ** 購読する
- 新機能で realtime を使う前に、「本当に即時反映が必要か」を先に検討する

### ルールC: 広い select と大きい payload を避ける
- Supabase 移行後は `select *` を安易に増やさず、画面に必要な列だけ取る
- 長文本文・履歴配列・巨大 map・base64 文字列を一覧系レスポンスに混ぜない
- 画像・添付・大きいファイルは DB 本体に持たず、Storage や外部リンクで分離する

### ルールD: 履歴・集計・横断表示は手動実行を基本にする
- 完了済み履歴、アーカイブ、月次集計、全社横断集計は初期表示で自動実行しない
- 「タブを開いた時だけ」「集計ボタンを押した時だけ」「期間を確定した時だけ」実行する

### ルールE: 新しい取得は転送診断の対象に含める
- 新しい `getDocs()` / `onSnapshot()` / `getDoc()` 相当や、Supabase の新しい fetch を追加したら `転送診断` で追えるようにする
- 少なくとも「どの画面を開くと何件・何KBくらい動くか」は後から見える状態を維持する
- 30人想定の月間転送見積もりが急に跳ねる変更は、そのまま merge しない

### ルールF: 実装後は PC / スマホの両方で確認する
- 表示確認だけでなく `保存 → 閉じる → 再表示 → 関連画面反映` まで見る
- 転送量まわりの変更後は `転送診断` を見て、ホーム初期表示やモーダル表示で不要な大きい取得が走っていないか確認する

## 完了済みタスク・誤再開防止

### style.css のハードコード色 CSS変数化
- 2026-03-23 の `f9641a8 docs: 完了済みの style.css CSS変数化タスクを積み残しから削除` で完了扱い。
- `style.css` の色検索結果だけを根拠に、この作業を未完了タスクとして再開しない。`:root` / `[data-theme="light"]` の変数定義、ブランド色、プレビュー見本、ロック画面専用変数は置換対象外。
- 新しい UI でテーマ崩れを見つけた場合は、該当機能ブロックだけを修正する。`style.css` 全体の一括置換タスクとして扱わない。

**継続する運用ルール**:
- `style.css` では **新しいハードコード色を追加しない**
- 色を追加したい場合は、先に `:root` / `[data-theme="light"]` の CSS 変数へ定義してから使う
- 例外として残してよいのは `ブランド固有色`、`プレビュー見本`、`ロゴ/装飾表現` のみ
- 例外色を追加する場合も、可能なら用途が分かる変数名を作って経由させる

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
- 実機テスト用のPINなど**秘密値そのものは AGENTS.md に書かない**。必要な場合はローカル専用の `C:\Users\frx\.codex\memory.md` を参照し、ここには「ローカル専用メモを使う」という運用ルールだけ残す

## 2026-03-18 Supabase runtime config（shared core）

> この章は移行履歴メモ。現在の runtime 方針は「Supabase 本線 / Firebase は移行スクリプト専用」。ここにある Firebase fallback や未対応一覧を、現在の新規実装タスクとして再開しない。

- `portal/config` に次の runtime 設定を追加して扱う
  - `dataBackendMode`: 旧互換項目。現在の runtime は `modules/supabase.js` 側で常に `'supabase'` を設定する
  - `supabaseUrl`: Supabase project URL
  - `supabasePublishableKey`: フロントで使う API key（publishable 推奨）
  - `supabaseAnonKey`: 旧メモ互換の fallback。新規保存は `supabasePublishableKey` を優先
- **Supabase 切替済み対象（Step 3 = Phase A 完了）**
  - `public_categories` ✅
  - `public_cards` ✅
  - `notices` ✅（2026-03-19 追加。realtime なし、一回読み込み）
  - `notice_reactions` ✅（行単位 insert/delete。Firebase の arrayUnion は使わない）
  - `user_notice_reads` ✅（`username` + `notice_id` 行単位）
- 管理画面の `データ接続設定` から保存する
- 新規実装では Firebase / Firestore fallback を増やさない。既存 fallback は Supabase 未設定時の旧互換分岐としてのみ扱い、整理するときは機能単位で削る。

### notices Supabase の注意点
- `subscribeNotices()` は Supabase モードで `async function` に変更済み。呼び出し元は `await` 必須
- `acknowledged_by` は PATCH で配列ごと上書き（optimistic 更新後に state の値を送る）
- `notice_reactions` は `(notice_id, emoji, username)` 行単位。Firebase の `{ emoji: [username] }` map へは JS 側で groupBy して変換

## 2026-03-19 Supabase Step 4 完了（個人データ Supabase 対応）

### 切替済み個人データ
| Supabase テーブル | Firebase パス | 変更先 |
|---|---|---|
| `user_accounts` | `users_list/{name}` | `modules/auth.js` |
| `user_lock_pins` | `users/{name}/data/lock_pin` | `modules/auth.js` |
| `user_preferences` | `users/{name}/data/preferences` | `script.js` |
| `user_section_orders` | `users/{name}/data/section_order` | `script.js` |
| `user_profiles` | `users/{name}/data/email_profile` | `modules/email.js` |
| `private_sections` | `users/{name}/private_sections` | `script.js` |
| `private_cards` | `users/{name}/private_cards` | `script.js` |

### 注意点
- 現在の `registerUserLogin` は Supabase `user_accounts` が本線。Firebase `users_list` への並行書込み前提は旧メモとして扱う。
- 読込は Supabase 本線。Firestore fallback 前提の記述は旧互換分岐の説明であり、新規に広げない。
- `user_preferences` は `lastViewedSuggestionsAt` を ISO 文字列 ↔ `seconds` で変換
- `private_cards` の `category` フィールドは Supabase の `section_id` にマッピング
- 旧未対応メモ: `user_todos` / `user_email_contacts` / `user_drive_links` / `user_drive_contacts` / `user_chat_reads` は現在 `modules/supabase.js` に Supabase 関数があるため、未対応扱いで繰り返さない。

## Supabase 移行追記（2026-03-18 / 個人データ続き）
- `supabase/004_fix_private_cards_hierarchy.sql` を remote 適用済み
  - `private_cards` は `parent_section_id` ではなく `section_id + parent_id` を持つ形に補正した
- `tools/build-firestore-private-data-sql.mjs` を追加済み
  - 対象: `section_order / read_notices / private_sections / private_cards / todos`
  - 実データ入りの生成 SQL は `supabase/generated-*.sql` としてローカル生成し、実行後に削除する
- Firestore 個人データの移行状況
  - `section_order`: Firestore 側 0 件
  - `private_sections`: Supabase 1 件移行済み
  - `private_cards`: Supabase 1 件移行済み
  - `todos`: Supabase 1 件移行済み
  - `read_notices`: Firestore 側 11 件あるが、参照先 `notices` が現在 0 件のため孤立データ扱いで保留
- `read_notices` は `tools/build-firestore-private-data-sql.mjs` が `public.notices` に存在する ID だけ投入する
  - 将来 `notices` を移したあとに同スクリプトを再実行すれば `user_notice_reads` を追加入力できる
- `tools/build-firestore-user-contacts-sql.mjs` を追加済み
  - 対象: `email_contacts / drive_link / drive_contacts`
- Firestore 個人連絡先データの移行状況
  - `email_contacts`: Supabase 1 件移行済み
  - `drive_link`: Supabase 1 件移行済み
  - `drive_contacts`: Supabase 1 件移行済み
  - 現時点の実データは `髙林` の 1 セットのみ確認
- Firestore 通知データの現況
  - `notices`: 0 件
  - `notice_reactions`: 4 件あるが、参照先通知が空のため孤立データ扱い
  - `read_notices`: 11 件あるが、同じく参照先通知が空のため保留のまま
- `supabase/005_add_attendance_tables.sql` を remote 適用済み
- `tools/build-firestore-attendance-sql.mjs` を追加済み
  - 対象: `attendance_sites / users/{name}/attendance`
- Firestore 勤怠データの移行状況
  - `attendance_sites`: Supabase 523 件移行済み
  - `attendance_entries`: Supabase 14 件移行済み
  - 現時点の個人勤怠は `髙林=13件 / 佐野=1件`
- `supabase/006_add_request_task_tables.sql` を remote 適用済み
- `tools/build-firestore-request-task-sql.mjs` を追加済み
  - 対象: `cross_dept_requests / assigned_tasks`
- Firestore 業務依頼データの移行状況
  - `cross_dept_requests`: Supabase 11 件移行済み
  - `assigned_tasks`: Supabase 16 件移行済み
  - 現時点の実データでは `assigned_tasks.sourceType` はすべて `manual`
- `tools/invoke-supabase-sql-statements.mjs` を追加済み
  - Management API に `generated-*.sql` を1文ずつ流す補助ツール
  - 一括 `SqlFile` 実行で件数が入らない場合は、こちらで逐次適用して切り分ける

## Supabase 移行履歴メモ（2026-03-18 追加）

### 移行当時の方針
- Firestore の read 最適化を続けるより、段階的に `Supabase` へ移行する方針で進める
- 以後の Supabase 操作は Codex 側で SQL editor / テーブル作成まで担当する前提でステップを切る
- ただし `project URL / anon key / service role key / project ref` などの秘密値は repo に書かない
- 秘密値はローカル専用の `C:\Users\frx\.codex\memory.md` に保存する
- まずは `DB 置換` を優先し、移行当時は `ニックネームログイン + 招待コード + ログイン前 PIN` の UX を維持していた。現在の入口は Googleログイン。

### 参照先
- 詳細な移行順とフェーズは `docs/supabase-migration-plan.md` に履歴として残す。現在の未完了タスク一覧として扱わない。

### 移行当時の開始点
1. `Step 0`: Supabase プロジェクト情報の扱いをローカル秘密値へ固定
2. `Step 1`: `supabase/001_core_schema.sql` を作成
3. `Step 2`: shared core 用の DB adapter 設計へ入る

### 進捗
- Supabase project `Portal` に CLI で link 済み
- `supabase/001_core_schema.sql` は remote に適用済み
- `supabase/002_fix_core_ids_to_text.sql` で Firestore 由来 ID を text に補正済み
- `supabase/003_user_lock_pin_auto_lock_minutes.sql` で `user_lock_pins.auto_lock_minutes` を追加済み
- `portal_config` は Firestore から Supabase へ移行済み
- `public_categories` は 6 件移行済み
- `public_cards` は 98 件移行済み
- `public_cards.parent_id` 付き子カードは 34 件確認済み
- `users_list` 由来の `user_accounts` は 7 件移行済み
- `users/{name}/data/preferences` は 7 件移行済み
- `users/{name}/data/email_profile` は 1 件移行済み
- `users/{name}/data/lock_pin` は 3 件移行済み
- 共有コアの移行済み: `portal_config / public_categories / public_cards`
- 個人コアの移行済み: `user_accounts / user_preferences / user_profiles / user_lock_pins`
- まだ未移行の個人データ: `section_order / read_notices / private_sections / private_cards / todos / email_contacts / drive_link / drive_contacts`
- 現時点で作成確認できた core tables:
  - `portal_config`
  - `public_categories`
  - `public_cards`
  - `notices`
  - `notice_reactions`
  - `user_accounts`
  - `user_profiles`
  - `user_preferences`
  - `user_lock_pins`
  - `private_sections`
  - `private_cards`
  - `user_todos`
  - `user_email_contacts`
- 秘密値は repo に書かず、`C:\Users\frx\.codex\memory.md` にのみ保存する
- `supabase db query --linked` は一時 login role 初期化で不安定になることがある
- 以後の remote SQL 実行は、基本的に `tools/invoke-supabase-sql.ps1` + Management API を優先する
- `tools/invoke-supabase-sql.ps1` は UTF-8 body 送信済み。日本語を含む SQL でも remote 実行できる
- Firestore 実データから生成した一時 SQL は repo に残さない。必要なら `supabase/generated-*.sql` をローカル生成して、その場で実行後に削除する
## 2026-03-18 Supabase 追加進捗（orders）
- `supabase/007_add_order_tables.sql` を remote 適用済み
  - `order_suppliers / order_items / orders` を追加
- `tools/build-firestore-orders-sql.mjs` を追加
  - 対象: `order_suppliers / order_items / orders`
- Firestore 実データの移行結果
  - `order_suppliers`: Supabase 2 件
  - `order_items`: Supabase 888 件
  - `orders`: Supabase 10 件
  - `orders.deleted_at is not null`: 8 件
  - `orders.email_sent = true`: 6 件
  - `orders.project_key` が入っている既存データ: 0 件
- `tools/invoke-supabase-sql-statements.mjs` を更新
  - `--batch-size=25` を追加
  - 発注データのように statement 数が多い場合は、小分けバッチで Management API へ流す

## 2026-03-18 Supabase 追加進捗（company calendar）
- `supabase/008_add_company_calendar_tables.sql` を remote 適用済み
  - `company_calendar_settings / public_attendance_months` を追加
- `tools/build-firestore-company-calendar-sql.mjs` を追加
  - 対象: `company_calendar/config / public_attendance/{YYYY-MM}`
- Firestore 実データの移行結果
  - `company_calendar_settings`: Supabase 1 件
  - `public_attendance_months`: Supabase 1 件
  - `company_calendar_settings.work_saturdays`: 11 件
  - `company_calendar_settings.planned_leave_saturdays`: 3 件
  - `company_calendar_settings.holiday_ranges`: 2 件
  - `company_calendar_settings.events`: 0 件
  - `public_attendance_months.year_month=2026-03` に `06 / 09` の共有勤怠が入っていることを確認済み
- `tools/invoke-supabase-sql-statements.mjs` の前処理を修正
  - SQL 先頭の `--` コメント行を除去してから statement 分割するようにした
  - これで少件数の generated SQL でも silent no-op を起こしにくくした

## 2026-03-19 Step 4 残り完了（user_todos / user_email_contacts Supabase 対応）

### 追加した Supabase 関数（modules/supabase.js）
- `fetchUserTodosFromSupabase(username)` — `user_todos` を作成日昇順で取得
- `createUserTodoInSupabase(username, data)` — TODO 作成
- `updateUserTodoInSupabase(id, data)` — TODO 更新（done / text / dueDate）
- `deleteUserTodoInSupabase(id)` — TODO 削除
- `fetchEmailContactsFromSupabase(username)` — `user_email_contacts` を作成日昇順で取得
- `createEmailContactInSupabase(username, data)` — メール連絡先作成

### 変更したモジュール
| モジュール | 変更内容 |
|---|---|
| `script.js` | `loadTodos` / `addTodo` / `toggleTodo` / `deleteTodo` に Supabase 分岐を追加 |
| `modules/email.js` | `loadEmailContacts` / `saveNewContact` に Supabase 分岐を追加 |

### Supabase モードでの挙動
- `loadTodos`: onSnapshot を使わず `fetchUserTodosFromSupabase` で一回取得 → `state.personalTodos` に反映 → `renderTodoSection()`
- `addTodo` / `toggleTodo` / `deleteTodo`: Supabase 更新後に `state.personalTodos` をローカル更新 → `renderTodoSection()` で即時反映（再フェッチ不要）
- `loadEmailContacts`: Supabase 本線で取得。Firestore fallback 前提では扱わない
- `saveNewContact`: Supabase モード時は `createEmailContactInSupabase` を使用

### 参考DDL（移行当時のメモ）
```sql
-- user_todos
create table if not exists public.user_todos (
  id          text primary key,
  username    text not null,
  text        text not null default '',
  done        boolean not null default false,
  due_date    text,
  created_at  timestamptz not null default now()
);
create index if not exists user_todos_username_idx on public.user_todos (username);

-- user_email_contacts
create table if not exists public.user_email_contacts (
  id           text primary key,
  username     text not null,
  company_name text not null default '',
  person_name  text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists user_email_contacts_username_idx on public.user_email_contacts (username);
```

### 旧未対応個人データの現在扱い
- `user_drive_links` / `user_drive_contacts` / `user_chat_reads` は Supabase 関数と各機能側の呼び出しがあるため、未対応タスクとして再開しない。
- 追加で整理する場合は、旧 fallback 分岐や移行ツールの削除対象として扱う。
