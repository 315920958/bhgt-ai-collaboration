#!/usr/bin/env bash
#
# 一键把本地 nginx_conf/ 下修改好的 Nginx 配置「推」到线上服务器，并执行 reload。
#
# 只同步三项：nginx.conf、conf.d/、ssl_files/
# 因为 /etc/nginx 属主是 root、ubuntu 无写权限，故先 scp 到远端 /tmp 临时目录（ubuntu 可写），
# 再以 sudo 拷进 /etc/nginx 并校验+reload。
# reload 前先 sudo nginx -t 校验配置，配置有误时不会 reload，避免把线上 nginx 搞挂。
#
# 用法：
#   ./push_nginx_conf.sh            # 推送并 reload
#   ./push_nginx_conf.sh --dry-run  # 只显示目标信息，不真正推送、也不 reload
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$LOCAL_ROOT/nginx_conf"
REMOTE_TMP="/tmp/nginx_push_$$"   # 远端临时目录，ubuntu 可写，避免直接写 /etc/nginx 被拒

# ===== 服务器连接信息（按需修改）=====
REMOTE_USER_HOST="ubuntu@49.232.103.103"   # 若服务器允许 root SSH，可改为 root@... 则无需下方 sudo 中转
SSH_OPTS=""                                # 如需指定端口/密钥：例如 "-p 22 -i ~/.ssh/id_rsa"
# =====================================

if [[ ! -d "$SRC" ]]; then
  echo "==> 错误：本地目录不存在：$SRC（请先 pull 一次）"
  exit 1
fi

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
  echo "==> 演习模式：不会真正改动远端，也不会 reload"
fi

echo "==> 推送 Nginx 配置：$SRC/ -> $REMOTE_USER_HOST:/etc/nginx/ (经 /tmp 中转 + sudo)"

if [[ -z "$DRY_RUN" ]]; then
  # 1) 以 ubuntu 身份 scp 到远端可写临时目录
  ssh $SSH_OPTS "$REMOTE_USER_HOST" "mkdir -p $REMOTE_TMP/conf.d $REMOTE_TMP/ssl_files"
  scp -p $SSH_OPTS "$SRC/nginx.conf" "$REMOTE_USER_HOST:$REMOTE_TMP/"
  scp -r -p $SSH_OPTS "$SRC/conf.d/." "$REMOTE_USER_HOST:$REMOTE_TMP/conf.d/"
  scp -r -p $SSH_OPTS "$SRC/ssl_files/." "$REMOTE_USER_HOST:$REMOTE_TMP/ssl_files/" 2>/dev/null || true

  # 2) 以 root 权限拷入 /etc/nginx 并校验+reload（nginx -t 不过则不会 reload）；末尾清理临时目录
  echo "==> 以 sudo 拷入 /etc/nginx 并校验配置"
  ssh $SSH_OPTS "$REMOTE_USER_HOST" "sudo cp -f $REMOTE_TMP/nginx.conf /etc/nginx/ && sudo cp -rf $REMOTE_TMP/conf.d/. /etc/nginx/conf.d/ && (sudo cp -rf $REMOTE_TMP/ssl_files/. /etc/nginx/ssl_files/ 2>/dev/null || true) && sudo nginx -t && sudo nginx -s reload; sudo rm -rf $REMOTE_TMP"
  echo "==> 完成"
else
  echo "==> 演习结束。去掉 --dry-run 可真正推送并 reload。"
fi
