#!/usr/bin/env bash
#
# 一键把线上服务器的 Nginx 配置「拉」到本地。
#
# 直接 scp 递归拉取远端 Nginx 配置根目录，文件名 / 目录结构与服务器完全一致，
# 落到本地 nginx_conf/ 目录下（只拉 /etc/nginx 这一棵配置树，不碰日志 / 运行时）。
#
# 用法：
#   ./pull_nginx_conf.sh
#
# 前置条件：
#   - 本机能 SSH 到远端服务器（scp 可用）
#   - 远端 SSH 用户对 /etc/nginx 有读权限
#     （/etc/nginx 下配置多为 644/755，通常可直接读；
#       若报 Permission denied，请让该用户能读 /etc/nginx，或改用下方「tar+sudo」注释段）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DST="$LOCAL_ROOT/nginx_conf"

# ===== 服务器连接信息（按需修改，脚本不依赖任何外部 conf 文件）=====
REMOTE_USER_HOST="ubuntu@49.232.103.103"   # 例如 root@1.2.3.4
REMOTE_NGINX_DIR="/etc/nginx"          # Nginx 配置根目录
SSH_OPTS=""                            # 如需指定端口/密钥：例如 "-p 22 -i ~/.ssh/id_rsa"
# =======================================================

mkdir -p "$DST"

echo "==> 拉取 Nginx 配置：$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/  ->  $DST/"
echo "    （递归 scp，保留完整目录结构，文件名与服务器一致）"

# 源路径尾部的 "/." 表示「拉取该目录内的内容」，直接落到 nginx_conf/ 下，
# 目录结构、文件名与服务器 $REMOTE_NGINX_DIR 完全一致。
scp -r -p $SSH_OPTS "$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/." "$DST/"

# —— 若 SSH 用户无权直接读 /etc/nginx，改用 sudo 中转（保留结构/符号链接更可靠）——
# ssh $SSH_OPTS "$REMOTE_USER_HOST" "sudo tar -czf - -C $REMOTE_NGINX_DIR ." \
#   | tar -xzf - -C "$DST"

echo "==> 完成。本地配置位于：$DST"
