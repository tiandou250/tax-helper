#!/usr/bin/env bash
# 一键发布到 GitHub Pages（gh-pages 分支模式）
# 用法：bash scripts/deploy-pages.sh
set -euo pipefail

export PATH="/c/Users/14986/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd:/c/Users/14986/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:$PATH"
cd "$(dirname "$0")/.."

echo "1/3 构建（basePath=/tax-helper）"
pnpm build:pages

echo "2/3 提交构建产物"
cd out
if [ ! -d .git ]; then
  git init -q -b gh-pages
  git remote add origin git@github.com:tiandou250/tax-helper.git
fi
git add -A
git -c user.name=tiandou250 -c user.email=tiandou250@users.noreply.github.com commit -q -m "deploy: $(date '+%Y-%m-%d %H:%M')" || echo "（无变更）"

echo "3/3 推送到 gh-pages"
for i in 1 2 3 4 5; do
  if git push -f origin gh-pages; then
    echo "✔ 已推送，约 1 分钟后生效：https://tiandou250.github.io/tax-helper/"
    exit 0
  fi
  echo "第 $i 次失败，10 秒后重试（代理不稳定时常见）"
  sleep 10
done

echo "✘ 推送失败：请确认本地代理 127.0.0.1:7890 正常，再重跑本脚本"
exit 1
