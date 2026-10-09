#!/usr/bin/env bash
# 初回だけ使う：このフォルダを GitHub の空のリポジトリに push する。
# 使い方: bash scripts/setup_repo.sh https://github.com/<ユーザー名>/<リポジトリ名>.git
set -euo pipefail
REMOTE="${1:?GitHub リポジトリの URL を指定してください（例: https://github.com/you/ekimemo-radar.git）}"
cd "$(dirname "$0")/.."

python3 scripts/build.py
node tests/check_html.js
node tests/verify.js --quick

git init -b main
git add .
git commit -m "駅レーダー圏マップ: 初回コミット"
git remote add origin "$REMOTE"
git push -u origin main

echo
echo "push しました。次に GitHub で Settings → Pages → Source を「GitHub Actions」にしてください。"
echo "Actions の実行が終わると https://<ユーザー名>.github.io/<リポジトリ名>/ で公開されます。"
