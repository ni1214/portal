# Portal プロジェクト — Claude Code 向けメモ

このファイルは補助メモです。現在の正は `AGENTS.md` です。

## 現在の方針

- runtime 本線は Supabase。
- Firebase / Firestore 前提の古い実装計画は使わない。
- 古い Stitch 前提、外部デザイン案優先、プレミアム感 / グラスモーフィズム固定のルールは廃止。
- 主要 UI は、モーダル中心ではなくポータル本体の中で切り替わるレスポンシブ・ワークスペース UI へ段階移行する。
- PC 全画面、PC 半分幅、スマホ幅、light / dark で確認する。
- 詳細な開発ルール、データ設計、Git 運用は `AGENTS.md` を参照する。

## 注意

- このファイルに古い Firestore 設計、旧 UI の次回予定、Stitch URL、Claude 固有の常設エージェント運用を再追加しない。
- 「記録して」と言われた場合も、基本は `AGENTS.md` に追記する。
