#!/usr/bin/env bash
# 一键发布到 GitHub Pages（该仓库 Pages 走 gh-pages 分支模式）
# 用法：bash scripts/deploy-pages.sh
set -euo pipefail

export PATH="/c/Users/14986/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd:/c/Users/14986/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:$PATH"
cd "$(dirname "$0")/.."

REMOTE="git@github.com:tiandou250/tax-helper.git"
IDENT=(-c user.name=tiandou250 -c user.email=tiandou250@users.noreply.github.com)

echo "1/3 构建（basePath=/tax-helper）"
pnpm build:pages

echo "2/3 提交构建产物"
cd out
# next build 会清空 out/，连里面的 .git 一起删掉，所以每次都要重建仓库
if [ ! -d .git ]; then
  git init -q -b gh-pages
  git remote add origin "$REMOTE" 2>/dev/null || true
fi
git remote set-url origin "$REMOTE"

# 先拉已有历史再 reset --soft，让提交是增量的（全量 3MB 在代理上经常断）
BASE=""
for i in 1 2 3; do
  if git fetch -q origin gh-pages 2>/dev/null; then BASE=$(git rev-parse FETCH_HEAD 2>/dev/null || true); fi
  [ -n "$BASE" ] && break
  echo "  拉取历史失败，第 $i 次重试"
  sleep 5
done

if [ -n "$BASE" ]; then
  git reset -q --soft "$BASE"
  echo "  基于远端 $(echo "$BASE" | cut -c1-7) 增量提交"
fi

git add -A
git "${IDENT[@]}" commit -q -m "deploy: $(date '+%Y-%m-%d %H:%M')" || echo "  （内容无变化）"

echo "3/3 推送到 gh-pages"
for i in 1 2 3 4 5; do
  if git push -f origin gh-pages; then
    echo "✔ 已推送，约 1 分钟后生效：https://tiandou250.github.io/tax-helper/"
    exit 0
  fi
  # 代理不稳定时 push 会报 disconnect，但包常常已经到达远端
  if git ls-remote --heads origin gh-pages 2>/dev/null | grep -q gh-pages; then
    LOCAL=$(git rev-parse HEAD)
    git fetch -q origin gh-pages 2>/dev/null || true
    if [ "$(git rev-parse FETCH_HEAD 2>/dev/null)" = "$LOCAL" ]; then
      echo "✔ 推送报错但远端已收到本次提交，视为成功"
      exit 0
    fi
  fi
  echo "第 $i 次失败，10 秒后重试（代理不稳定时常见）"
  sleep 10
done

echo "✘ 推送失败：请确认本地代理 127.0.0.1:7890 正常，再重跑本脚本"
exit 1
