# 自宅PCでの再開手順

このリポジトリは、開発用のローカル設定を `.claude/` に置く運用です。`.claude/` は Git には入れず、各PCで自動生成します。

## 手順
1. リポジトリを clone します。
2. PowerShell をこのリポジトリのルートで開きます。
3. 次を実行します。

```powershell
.\tools\setup-claude-local.ps1
```

## これで作られるもの
- `.claude/server.js`
- `.claude/launch.json`
- `.claude/settings.local.json`

## 使い方
- その後は Codex / Claude Code でこのリポジトリを開けば、同じ流れで開発を続けられます。
- 画面確認用のローカルサーバーも、`portal-dev` の設定で起動できます。

## 補足
- `node_modules/` や `test-results/` は Git に入れません。
- 必要になったらこのスクリプトをもう一度実行すれば、ローカル設定を作り直せます。
