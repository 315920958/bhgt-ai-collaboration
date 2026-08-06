#!/usr/bin/env bash
#
# 一键把线上服务器的 Nginx 配置「拉」到本地。
#
# 只同步三项：nginx.conf、conf.d/、ssl_files/
# 落到本地 nginx_conf/ 目录下，文件名 / 目录结构与服务器一致。
#
# 用法：
#   ./pull_nginx_conf.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DST="$LOCAL_ROOT/nginx_conf"

# ===== 服务器连接信息（按需修改）=====
REMOTE_USER_HOST="ubuntu@49.232.103.103"   # 例如 root@1.2.3.4
SSH_OPTS=""                                # 如需指定端口/密钥：例如 "-p 22 -i ~/.ssh/id_rsa"
# =====================================

mkdir -p "$DST"

echo "==> 拉取 Nginx 配置：$REMOTE_USER_HOST -> $DST/"

scp -p $SSH_OPTS "$REMOTE_USER_HOST:/etc/nginx/nginx.conf" "$DST/"
scp -r -p $SSH_OPTS "$REMOTE_USER_HOST:/etc/nginx/conf.d/." "$DST/conf.d/"
scp -r -p $SSH_OPTS "$REMOTE_USER_HOST:/etc/nginx/ssl_files/." "$DST/ssl_files/" 2>/dev/null || true

echo "==> 完成。本地配置位于：$DST"
