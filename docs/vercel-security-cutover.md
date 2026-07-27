# Vercel + Supabase 本番切替手順

最終更新: 2026-07-28

## 切替前の必須条件

- 個人・非商用利用として、Vercel Hobby（無料）を使用する。商用・組織利用へ変わる場合は公開前にPro以上へ切り替える。
- 本番SupabaseプロジェクトへSQLを適用できる管理アクセスを用意する。
- 本番URLを確定し、`SITE_ORIGIN` とGoogle OAuthの許可URLを一致させる。
- 過去にGitへ入ったGoogle / Gemini / OpenWeather / GAS関連のキーを失効・再発行する。
- `gas-order-script.js` の最新版を新しいGASデプロイとして公開し、十分に長い新規トークンをScript Propertiesへ設定する。

秘密値をチャット、Git、ビルドログ、ブラウザ、Supabaseの公開レスポンスへ貼り付けない。

## 安全な実施順

1. 本番Supabaseをバックアップする。
2. `supabase/migrations/20260723000000_harden_portal_rls.sql` を本番へ適用する。
3. 管理者を含む利用者を `user_accounts` へ事前登録し、会社メール、部署、`is_active`、`is_admin` を確認する。
4. Supabase AuthでGoogle providerを有効にし、Site URL / Redirect URLsへVercel本番URLを設定する。Google Cloud側は、Authorized JavaScript originsへ本番originを、Authorized redirect URIへSupabaseが表示する `https://<project-ref>.supabase.co/auth/v1/callback` を設定する。
5. GAS最新版をデプロイし、`PORTAL_ORDER_TOKEN` をVercelの `GAS_ORDER_TOKEN` と同じ新規値にする。
6. Vercel HobbyチームにPortalプロジェクトを作成し、GitHubの `master` をProductionへ接続する。
7. `.env.example` に列挙した値をVercel Productionへ設定する。秘密値はSensitiveとして登録する。
8. Productionをデプロイし、下記の受入確認をすべて完了する。
9. 合格後にGitHub Pagesを停止する。必要ならリポジトリをPrivateへ変更する。
10. ローテーション完了を確認してからGitHubのSecret Scanning警告を解決済みにする。
11. `portal_config` などに残る旧APIキー、GAS URL、旧管理者PIN値を削除する。

## 本番受入確認

- 許可された `@framex.co.jp` のGoogle OAuthだけがログインできる。
- email/password、他provider、社外メール、未登録・無効アカウントは拒否される。
- 一般ユーザーは管理者操作、他人の個人データ、当事者でないチャット・P2P・Driveデータへアクセスできない。
- 保存、閉じる、再表示、関連画面への反映が成立する。
- AI、天気、発注メールは同一オリジン `/api/*` だけを使用し、レスポンスやログに秘密値が出ない。
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
