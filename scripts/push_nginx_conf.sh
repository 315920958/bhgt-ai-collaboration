#!/usr/bin/env bash
#
# 一键把本地 nginx_conf/ 下修改好的 Nginx 配置「推」到线上服务器，并执行 reload。
#
# 直接 scp 递归上传本地 nginx_conf/ 到远端 Nginx 配置根目录（文件名 / 目录结构 1:1 覆盖），
# reload 前先 nginx -t 校验配置，配置有误时不会 reload，避免把线上 nginx 搞挂。
#
# 用法：
#   ./push_nginx_conf.sh            # 推送并 reload
#   ./push_nginx_conf.sh --dry-run  # 只显示目标信息，不真正推送、也不 reload
#
# 前置条件：
#   - 本机能 SSH 到远端服务器（scp 可用）
#   - 远端 SSH 用户对 /etc/nginx 有写权限（建议用 root@，或该用户可 sudo 写）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$LOCAL_ROOT/nginx_conf"

# ===== 服务器连接信息（按需修改，脚本不依赖任何外部 conf 文件）=====
REMOTE_USER_HOST="root@你的服务器IP"   # 例如 root@1.2.3.4
REMOTE_NGINX_DIR="/etc/nginx"          # Nginx 配置根目录
SSH_OPTS=""                            # 如需指定端口/密钥：例如 "-p 22 -i ~/.ssh/id_rsa"
# =======================================================

if [[ ! -d "$SRC" ]]; then
  echo "==> 错误：本地目录不存在：$SRC（请先 pull 一次）"
  exit 1
fi

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
  echo "==> 演习模式：不会真正改动远端，也不会 reload"
fi

echo "==> 推送 Nginx 配置：$SRC/  ->  $REMOTE_USER_HOST:$REMOTE_NGINX_DIR/"

if [[ -z "$DRY_RUN" ]]; then
  scp -r -p $SSH_OPTS "$SRC/." "$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/"
  # —— 若 SSH 用户无权直接写 /etc/nginx，改用 sudo 中转 ——
  # ssh $SSH_OPTS "$REMOTE_USER_HOST" "sudo tar -xzf - -C $REMOTE_NGINX_DIR" \
  #   < <(tar -czf - -C "$SRC" .)
  echo "==> 校验配置并 reload"
  ssh $SSH_OPTS "$REMOTE_USER_HOST" "nginx -t && nginx -s reload"
  echo "==> 完成"
else
  echo "==> 演习结束。去掉 --dry-run 可真正推送并 reload。"
fi
