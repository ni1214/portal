# 自宅PCでの再開手順

このリポジトリは、`.claude/launch.json` と `.claude/settings.local.json` も Git で共有する運用にしました。なので、基本は **clone してそのまま開く** だけで大丈夫です。

## 手順
1. リポジトリを clone します。
2. Codex / Claude Code でこのリポジトリを開きます。
3. `portal-dev` の設定で起動します。

## もし設定が崩れたら
- `.\tools\setup-claude-local.ps1` を実行すると、ローカル設定を作り直せます。

## 補足
- `node_modules/` や `test-results/` は Git に入れません。
