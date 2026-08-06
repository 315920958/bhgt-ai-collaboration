#!/usr/bin/env bash
#
# 一键把本地修改好的 Nginx 配置「推」到线上服务器，并执行 sudo nginx -s reload。
#
# 远端以 sudo rsync 写入 /etc/nginx（属 root）；reload 前先 nginx -t 校验配置，
# 配置有误时不会 reload，避免把线上 nginx 搞挂。
#
# 用法：
#   ./push_nginx_conf.sh            # 推送并 reload
#   ./push_nginx_conf.sh --dry-run  # 只显示会改动什么，不真正推送、也不 reload
#
# 前置条件：
#   - 本机能 SSH 到远端服务器
#   - 远端用户对该服务器有 sudo 写权限
#     （建议 sudoers 开放 NOPASSWD: /usr/bin/rsync, /usr/sbin/nginx，否则会交互式要密码）
#
# 安全提醒：
#   --delete 会把「远端有、但本地没有」的配置删掉（保持两边一致）。
#   推送前请先 pull 一次，确认本地是你想推的全量内容。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/nginx_remote.conf"

LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "==> 演习模式：不会真正改动远端，也不会 reload"
fi

echo "==> 推送 Nginx 配置：$LOCAL_ROOT  ->  $REMOTE_USER_HOST:$REMOTE_NGINX_DIR"

for rel in "${REMOTE_PATHS[@]}"; do
  if [[ "$rel" == */ ]]; then
    # 目录：把本地目录内容同步进远端同名目录
    name="${rel%/}"
    src="$LOCAL_ROOT/$name/"
    dst="$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/$name"
    if [[ ! -d "$LOCAL_ROOT/$name" ]]; then
      echo "  -> 跳过（本地目录不存在）: $LOCAL_ROOT/$name"
      continue
    fi
  else
    # 文件：整体同步
    src="$LOCAL_ROOT/$rel"
    dst="$REMOTE_USER_HOST:$REMOTE_NGINX_DIR/$rel"
    if [[ ! -e "$src" ]]; then
      echo "  -> 跳过（本地文件不存在）: $src"
      continue
    fi
  fi
  echo "  -> $src"
  rsync -avz --delete $DRY_RUN \
    -e "ssh $SSH_OPTS" \
    --rsync-path="$RSYNC_PATH" \
    "$src" "$dst"
done

if [[ -n "$DRY_RUN" ]]; then
  echo "==> 演习结束（未改动远端）。去掉 --dry-run 可真正推送并 reload。"
  exit 0
fi

echo "==> 校验配置并 reload"
ssh $SSH_OPTS "$REMOTE_USER_HOST" "sudo nginx -t && sudo nginx -s reload"
echo "==> 完成"
