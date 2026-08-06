#!/usr/bin/env bash
#
# 一键把线上服务器的 Nginx 配置「拉」到本地（仅配置文件，不含日志/运行时）。
#
# 远端 /etc/nginx 属 root，因此用 --rsync-path="sudo rsync" 以 root 身份读取。
#
# 用法：
#   ./pull_nginx_conf.sh
#
# 前置条件：
#   - 本机能 SSH 到远端服务器
#   - 远端用户对该服务器有 sudo 读权限
#     （建议 sudoers 开放 NOPASSWD: /usr/bin/rsync，否则会交互式要密码）
#
# 拉取结果落在：nginx_conf/conf.d/ 、 nginx_conf/nginx.conf
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/nginx_remote.conf"

LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 拉取 Nginx 配置：$REMOTE_USER_HOST:$REMOTE_NGINX_DIR  ->  $LOCAL_ROOT"

for rel in "${REMOTE_PATHS[@]}"; do
  if [[ "$rel" == */ ]]; then
    # 目录：把远端目录内容同步进本地同名目录
    name="${rel%/}"
    src="$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/$rel"
    dst="$LOCAL_ROOT/$name"
  else
    # 文件：整体同步
    src="$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/$rel"
    dst="$LOCAL_ROOT/$rel"
  fi
  mkdir -p "$(dirname "$dst")"
  echo "  -> $src"
  rsync -avz --delete \
    -e "ssh $SSH_OPTS" \
    --rsync-path="$RSYNC_PATH" \
    "$src" "$dst"
done

echo "==> 完成。本地配置位于：$LOCAL_ROOT"
