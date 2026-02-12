#!/bin/bash
set -e

# Detect Docker Desktop (macOS/Windows) via workspace mount filesystem type
is_docker_desktop() {
    local fstype
    fstype=$(awk '$2 == "/workspace" {print $3}' /proc/mounts 2>/dev/null)
    case "$fstype" in
        virtiofs|grpcfuse|fuse.grpcfuse) return 0 ;;
        *) return 1 ;;
    esac
}

# Fix ownership for named volumes (these are not bind mounts, so chown is safe on all platforms)
sudo chown -R "$(id -u)":"$(id -g)" /commandhistory /home/devuser/.claude

# Fix ownership for bind-mounted workspace
# Docker Desktop (macOS/Windows) ではVM経由のため、chownはコンテナ内のみに影響（安全）
# ネイティブLinux Docker ではbind mountが直接共有されるため、chownはホスト側にも影響するのでスキップ
if is_docker_desktop; then
    sudo find /workspace -not -path '/workspace/.git/*' -exec chown "$(id -u)":"$(id -g)" {} + 2>/dev/null || true
else
    # ネイティブLinuxではupdateRemoteUserUID=trueによりUIDが自動一致するため、chown不要
    WORKSPACE_OWNER=$(stat -c '%u' /workspace 2>/dev/null)
    if [ "$WORKSPACE_OWNER" != "$(id -u)" ]; then
        echo "WARNING: Workspace owner UID ($WORKSPACE_OWNER) does not match container user UID ($(id -u))."
        echo "Consider setting USER_UID/USER_GID build args in devcontainer.json to match your host user."
    fi
fi
