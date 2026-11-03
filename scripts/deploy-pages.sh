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
# 本机 ~/.ssh/config 把 GitHub 强制走本地代理，代理挂掉时推送必然失败；
# 这里优先直连（22 端口实测可用），失败再退回配置文件里的代理链路。
DIRECT_SSH="ssh -F /dev/null -o StrictHostKeyChecking=accept-new -o BatchMode=yes -i $HOME/.ssh/id_ed25519"

try_push() {
  if GIT_SSH_COMMAND="$DIRECT_SSH" git push -f origin gh-pages 2>/tmp/push-direct.log; then
    return 0
  fi
  # push 报错但包可能已到远端
  LOCAL=$(git rev-parse HEAD)
  git fetch -q origin gh-pages 2>/dev/null || true
  [ "$(git rev-parse FETCH_HEAD 2>/dev/null)" = "$LOCAL" ] && return 0
  git push -f origin gh-pages
}

for i in 1 2 3 4 5; do
  if try_push; then
    echo "✔ 已推送，约 1 分钟后生效：https://tiandou250.github.io/tax-helper/"
    exit 0
  fi
  echo "第 $i 次失败，10 秒后重试（代理不稳定时常见）"
  sleep 10
done

echo "✘ 推送失败：请确认本地代理 127.0.0.1:7890 正常，再重跑本脚本"
exit 1
