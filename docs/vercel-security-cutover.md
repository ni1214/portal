# Vercel + Supabase 本番切替手順

最終更新: 2026-07-29

## 切替前の必須条件

- 個人・非商用利用として、Vercel Hobby（無料）を使用する。商用・組織利用へ変わる場合は公開前にPro以上へ切り替える。
- 本番SupabaseプロジェクトへSQLを適用できる管理アクセスを用意する。
- SupabaseのAPI Keysで、Vercel Functions専用の新しいSecret key（`sb_secret_...`）を作成する。
- 本番URLを確定し、`SITE_ORIGIN` とGoogle OAuthの許可URLを一致させる。
- 過去にGitへ入ったGoogle / Gemini / OpenWeather / GAS関連のキーを失効する。OpenWeatherは廃止済みのため再発行せず、天気はAPIキー不要のOpen-Meteoへ一本化する。
- `gas-order-script.js` の最新版を新しいGASデプロイとして公開し、十分に長い新規トークンをScript Propertiesへ設定する。
- Open-Meteo Free APIは個人・非商用利用に限定し、公式上限（1日10,000回、1時間5,000回、1分600回）を超えない運用を維持する。ポータル側の認証済み利用者ごとの天気取得上限は1時間30回とする。

秘密値をチャット、Git、ビルドログ、ブラウザ、Supabaseの公開レスポンスへ貼り付けない。

## 安全な実施順

1. 本番Supabaseをバックアップする。
2. 管理者候補を含む利用者について、現行 `user_accounts` の許可GoogleメールとAuth UIDが完全一致していることを確認する。個人利用でもドメイン全体は許可しない。
3. Supabase AuthでGoogle providerだけを有効にし、リンク済み利用者を確認してから新規ユーザー登録、メールprovider、匿名ログイン、手動identity linkingを無効化する。Redirect URLsへVercel本番origin `https://fremex-production-portal.vercel.app/` を追加する。Google Cloud側はAuthorized JavaScript originsへ同じoriginを、Authorized redirect URIへSupabaseが表示する `https://<project-ref>.supabase.co/auth/v1/callback` を設定する。
4. Vercel HobbyのPortalプロジェクトへ `.env.example` のProduction値を設定する。`SITE_ORIGIN` は `https://fremex-production-portal.vercel.app` の完全一致、`SUPABASE_SECRET_KEY` は新しい `sb_secret_...` とし、秘密値はSensitiveで登録する。
5. GAS最新版を新規デプロイし、`PORTAL_ORDER_TOKEN` をVercelの `GAS_ORDER_TOKEN` と同じ新規値にする。Gemini・GASの旧値を再利用しない。OpenWeatherのVercel環境変数は作成せず、既存の `OPENWEATHER_API_KEY` があれば削除する。
6. 検証済みの現在ソースをVercel Productionへ先にデプロイし、公開ページが200、許可originの未認証APIが401、不正originが403になることを確認する。SupabaseのSite URLはこの時点でVercel本番originへ切り替える。
7. `supabase/migrations/20260723000000_harden_portal_rls.sql` を本番へ適用し、直後に39テーブルの強制RLS、匿名権限0件、リンク済み1アカウントの `is_active` / `is_admin` / `access_department` を管理経路で監査する。
8. 下記の認証済み受入確認に合格した後だけ、`master`をpushしてGitHub Pagesを停止し、GitHub Pages・localhost・127.0.0.1など不要になったSupabase Redirect URLsを削除する。必要ならリポジトリをPrivateへ変更する。
9. Vercel Functionsが新しいSecret keyだけで動作することを確認してから、Supabaseの旧`service_role` keyを無効化する。
10. ローテーション完了を確認してからGitHubのSecret Scanning警告を解決済みにする。
11. マイグレーションで `portal_config` から旧APIキー、GAS URL、旧管理者PIN列が消えていることを再確認する。

## 本番受入確認

- `user_accounts`へ事前登録したメール完全一致のGoogle OAuthだけがログインできる。
- email/password、他provider、未登録の別Googleアカウント、別UID、無効アカウントは拒否される。
- 一般ユーザーは管理者操作、他人の個人データ、当事者でないチャット・P2P・Driveデータへアクセスできない。
- 保存、閉じる、再表示、関連画面への反映が成立する。
- AI、天気、発注メールは同一オリジン `/api/*` だけを使用し、レスポンスやログに秘密値が出ない。天気はOpen-Meteoをサーバー側から1回だけ呼び、APIキーを要求・送信しない。
- 発注メールの結果不明時は自動再送されない。
- 管理者確認は `authorize_order_email_resolution` → GASの同一attempt照合 → `resolve_order_email_send` の順で動く。
- GASで送信済み、または別attemptの状態を「未送信」に戻せない。
- Productionの公開物に `AGENTS.md`、`docs/`、`supabase/`、`tools/`、`.env*`、`gas-order-script.js` が含まれない。
- CSP、HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` が付与される。
- 1440px、PC半幅、390px、およびlight/darkで横スクロールとコンソールエラーがない。
- `npm run check` と `npm audit --audit-level=high` が成功する。
- HobbyのUsage画面を確認し、無料枠超過による一時停止が業務影響にならない個人利用であることを維持する。

## Preview方針

Previewは本番ポータルを起動せず、ネットワークアクセスのない停止ページだけを配信する。本番Supabaseや本番秘密値をPreviewへ設定しない。

## 切替を止める条件

次のいずれかが残る場合は、GitHub Pages停止やProduction公開を行わない。

- 本番Supabaseマイグレーション未適用
- Google OAuth未設定
- 過去キーの失効・再発行未完了
- GAS最新版と新規トークン未設定
- 個人・非商用利用の範囲を超えている
- 認証済みの本番E2E未完了
