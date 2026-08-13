#!/usr/bin/env bash
#
# 将 nginx_conf/ssl_zip/ 中的证书 ZIP 解压、上传到服务器，并重载 Nginx。
#
# 约定：每个 ZIP 必须包含唯一的顶层目录。例如：
#   ssl_zip/example.com_nginx.zip
#     └── example.com_nginx/
#
# 成功流程：
#   1. 解压至 nginx_conf/ssl_files/<顶层目录>/
#   2. 上传该目录至 /etc/nginx/ssl_files/<顶层目录>/
#   3. 执行 sudo nginx -t 和 sudo nginx -s reload
#   4. 仅在以上全部成功后，删除已处理的本地 ZIP
#
# 用法：
#   ./sync_ssl_certificates.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZIP_DIR="$LOCAL_ROOT/nginx_conf/ssl_zip"
SSL_DIR="$LOCAL_ROOT/nginx_conf/ssl_files"

# 与 push_nginx_conf.sh 保持一致；如服务器地址变更，请两个脚本一并修改。
REMOTE_USER_HOST="ubuntu@49.232.103.103"
REMOTE_SSL_DIR="/etc/nginx/ssl_files"

if [[ $# -gt 0 ]]; then
  echo "用法：$0" >&2
  exit 2
fi

if [[ ! -d "$ZIP_DIR" ]]; then
  echo "错误：证书 ZIP 目录不存在：$ZIP_DIR" >&2
  exit 1
fi

mkdir -p "$SSL_DIR"

shopt -s nullglob
ZIP_FILES=("$ZIP_DIR"/*.zip)
if [[ ${#ZIP_FILES[@]} -eq 0 ]]; then
  echo "没有待处理的 ZIP：$ZIP_DIR"
  exit 0
fi

# 先验证全部 ZIP，避免上传了部分证书才发现后续压缩包不符合约定。
TOP_LEVEL_DIRS=()
for zip_file in "${ZIP_FILES[@]}"; do
  archive_roots="$(unzip -Z -1 "$zip_file" | awk -F/ 'NF { print $1 }' | sort -u)"
  root_count="$(printf '%s\n' "$archive_roots" | awk 'NF { count++ } END { print count + 0 }')"
  archive_root="$(printf '%s\n' "$archive_roots" | awk 'NF { print; exit }')"
  if [[ "$root_count" -ne 1 || -z "$archive_root" ]]; then
    echo "错误：$zip_file 必须只包含一个顶层目录" >&2
    exit 1
  fi
  if [[ "$archive_root" == "." || "$archive_root" == ".." ]]; then
    echo "错误：$zip_file 顶层目录不安全：$archive_root" >&2
    exit 1
  fi
  TOP_LEVEL_DIRS+=("$archive_root")
done

echo "待同步 ${#ZIP_FILES[@]} 个证书包："
for index in "${!ZIP_FILES[@]}"; do
  echo "  - $(basename "${ZIP_FILES[$index]}") -> $SSL_DIR/${TOP_LEVEL_DIRS[$index]}/"
done

echo "==> 解压证书到本地 ssl_files"
for zip_file in "${ZIP_FILES[@]}"; do
  unzip -oq "$zip_file" -d "$SSL_DIR"
done

REMOTE_TMP="/tmp/bhgt_ssl_sync_$$"
cleanup_remote_tmp() {
  ssh "$REMOTE_USER_HOST" "rm -rf '$REMOTE_TMP'" >/dev/null 2>&1 || true
}
trap cleanup_remote_tmp EXIT

echo "==> 上传证书目录到 $REMOTE_USER_HOST:$REMOTE_SSL_DIR"
ssh "$REMOTE_USER_HOST" "mkdir -p '$REMOTE_TMP'"
for top_level_dir in "${TOP_LEVEL_DIRS[@]}"; do
  scp -r -p "$SSL_DIR/$top_level_dir" "$REMOTE_USER_HOST:$REMOTE_TMP/"
done

echo "==> 安装证书并校验、重载 Nginx"
ssh "$REMOTE_USER_HOST" \
  "sudo mkdir -p '$REMOTE_SSL_DIR' && sudo cp -a '$REMOTE_TMP/.' '$REMOTE_SSL_DIR/' && sudo nginx -t && sudo nginx -s reload"

echo "==> 重载成功，删除已上传的本地 ZIP"
for zip_file in "${ZIP_FILES[@]}"; do
  rm -f "$zip_file"
done

echo "完成：证书已同步到 $REMOTE_SSL_DIR，Nginx 已重载。"
