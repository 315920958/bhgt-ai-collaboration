#!/usr/bin/env bash
#
# 一键把本地 nginx_conf/ 下修改好的 Nginx 配置「推」到线上服务器，并执行 reload。
#
# 只同步三项：nginx.conf、conf.d/、ssl_files/
# reload 前先 nginx -t 校验配置，配置有误时不会 reload，避免把线上 nginx 搞挂。
#
# 用法：
#   ./push_nginx_conf.sh            # 推送并 reload
#   ./push_nginx_conf.sh --dry-run  # 只显示目标信息，不真正推送、也不 reload
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$LOCAL_ROOT/nginx_conf"

# ===== 服务器连接信息（按需修改）=====
REMOTE_USER_HOST="ubuntu@49.232.103.103"   # 例如 root@1.2.3.4
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

echo "==> 推送 Nginx 配置：$SRC/ -> $REMOTE_USER_HOST:/etc/nginx/"

if [[ -z "$DRY_RUN" ]]; then
  scp -p $SSH_OPTS "$SRC/nginx.conf" "$REMOTE_USER_HOST:/etc/nginx/"
  scp -r -p $SSH_OPTS "$SRC/conf.d/." "$REMOTE_USER_HOST:/etc/nginx/conf.d/"
  scp -r -p $SSH_OPTS "$SRC/ssl_files/." "$REMOTE_USER_HOST:/etc/nginx/ssl_files/" 2>/dev/null || true

  echo "==> 校验配置并 reload"
  ssh $SSH_OPTS "$REMOTE_USER_HOST" "nginx -t && nginx -s reload"
  echo "==> 完成"
else
  echo "==> 演习结束。去掉 --dry-run 可真正推送并 reload。"
fi
