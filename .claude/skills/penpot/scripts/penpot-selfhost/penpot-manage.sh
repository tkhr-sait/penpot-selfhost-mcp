#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="penpot"

# Derived names from PROJECT_NAME
CT_BACKEND="${PROJECT_NAME}-penpot-backend-1"
CT_POSTGRES="${PROJECT_NAME}-penpot-postgres-1"
CT_MCP_CONNECT_CLAUDE="${PROJECT_NAME}-penpot-mcp-connect-claude-1"
IMG_MCP_CLAUDE="${PROJECT_NAME}-penpot-mcp-claude"
IMG_MCP_COPILOT="${PROJECT_NAME}-penpot-mcp-copilot"
IMG_MCP_CONNECT_CLAUDE="${PROJECT_NAME}-penpot-mcp-connect-claude"
IMG_MCP_CONNECT_COPILOT="${PROJECT_NAME}-penpot-mcp-connect-copilot"
VOL_ASSETS="${PROJECT_NAME}_penpot_assets"

dc() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

# Storybook profile 判定: storybook-static/ が存在すれば --profile storybook を返す
_storybook_profile_args() {
  local storybook_dir="${PENPOT_STORYBOOK_DIR:-../../../../../storybook-static}"
  local storybook_resolved
  if [[ "$storybook_dir" = /* ]]; then
    storybook_resolved="$storybook_dir"
  else
    storybook_resolved="$SCRIPT_DIR/$storybook_dir"
  fi
  if [ -d "$storybook_resolved" ]; then
    echo "--profile storybook"
  fi
}

_run_penpot_api() {
  docker exec $CT_MCP_CONNECT_CLAUDE \
    node /app/penpot-api.mjs --uri "http://penpot-frontend:8080" "$@"
}

_show_mcp_info() {
  local claude_plugin_port="${PENPOT_MCP_CLAUDE_PLUGIN_PORT:-4400}"
  local claude_http_port="${PENPOT_MCP_CLAUDE_HTTP_PORT:-4401}"
  local claude_ws_port="${PENPOT_MCP_CLAUDE_WS_PORT:-4402}"
  local copilot_plugin_port="${PENPOT_MCP_COPILOT_PLUGIN_PORT:-4410}"
  local copilot_http_port="${PENPOT_MCP_COPILOT_HTTP_PORT:-4411}"
  local copilot_ws_port="${PENPOT_MCP_COPILOT_WS_PORT:-4412}"

  echo "=== MCP Plugin Setup ==="
  echo ""
  echo "Claude Code Instance:"
  echo "  Plugin manifest:  http://localhost:${claude_plugin_port}/manifest.json"
  echo "  MCP HTTP/SSE:     http://localhost:${claude_http_port}/sse"
  echo "  WebSocket:        ws://localhost:${claude_ws_port}"
  echo ""
  echo "GitHub Copilot Instance:"
  echo "  Plugin manifest:  http://localhost:${copilot_plugin_port}/manifest.json"
  echo "  MCP HTTP/SSE:     http://localhost:${copilot_http_port}/sse"
  echo "  WebSocket:        ws://localhost:${copilot_ws_port}"
  echo ""
  echo "Auto-connect:"
  echo "  Both instances are connected automatically via headless Playwright."
  echo "  Check logs:  bash $0 logs penpot-mcp-connect-claude"
  echo "               bash $0 logs penpot-mcp-connect-copilot"
  echo "  Reconnect:   bash $0 mcp-connect [claude|copilot|all]"
  echo ""
  echo "Penpot Design System Storybook:"
  echo "  URL: http://localhost:${PENPOT_STORYBOOK_PORT:-6006}"
  echo ""
  echo "Reconnect MCP (client-side):"
  echo "  Claude Code:      /mcp -> penpot-official -> Reconnect"
  echo "  VS Code Copilot:  Ctrl+Shift+P -> 'MCP: List Servers' -> Restart"
}

cmd_up() {
  echo "Starting Penpot..."
  if ! docker image inspect $IMG_MCP_CLAUDE > /dev/null 2>&1; then
    echo "Building MCP Claude server image (first run, may take a few minutes)..."
    dc build penpot-mcp-claude
  fi
  if ! docker image inspect $IMG_MCP_COPILOT > /dev/null 2>&1; then
    echo "Building MCP Copilot server image (first run, may take a few minutes)..."
    dc build penpot-mcp-copilot
  fi
  if ! docker image inspect $IMG_MCP_CONNECT_CLAUDE > /dev/null 2>&1; then
    echo "Building MCP Claude auto-connect image (first run, may take a few minutes)..."
    dc build penpot-mcp-connect-claude
  fi
  if ! docker image inspect $IMG_MCP_CONNECT_COPILOT > /dev/null 2>&1; then
    echo "Building MCP Copilot auto-connect image (first run, may take a few minutes)..."
    dc build penpot-mcp-connect-copilot
  fi
  local sb_profile
  sb_profile=$(_storybook_profile_args)
  if [ -n "$sb_profile" ]; then
    echo "Storybook: 配信します"
  else
    echo "Info: storybook-static/ が見つかりません。Storybook コンテナはスキップ。"
    echo "  生成: npm run storybook:build → 再度 up で起動"
  fi
  dc $sb_profile up -d
  echo "Penpot is running at ${PENPOT_PUBLIC_URI:-http://localhost:9001}"
  echo ""

  # Auto-create default test user if not already registered
  _auto_setup_profile

  # Auto-create MCP dedicated users (Claude + Copilot)
  _auto_setup_mcp_profiles

  # Create shared team and add all users
  _setup_shared_teams

  # Ensure MCP workspace files exist (in shared team if available)
  _setup_mcp_workspace "${PENPOT_MCP_CLAUDE_EMAIL:-mcp-claude@penpot.local}" "${PENPOT_MCP_CLAUDE_PASSWORD:-mcpclaude123}"
  _setup_mcp_workspace "${PENPOT_MCP_COPILOT_EMAIL:-mcp-copilot@penpot.local}" "${PENPOT_MCP_COPILOT_PASSWORD:-mcpcopilot123}"

  _show_mcp_info
}

_auto_setup_profile() {
  local email="${PENPOT_DEFAULT_EMAIL:-dev@example.com}"
  local password="${PENPOT_DEFAULT_PASSWORD:-devdev123}"
  local fullname="${PENPOT_DEFAULT_NAME:-Developer}"

  # Wait for backend to be ready
  echo "Waiting for backend to be ready..."
  local retries=30
  while ! docker exec $CT_BACKEND curl -sf http://localhost:6060/readyz > /dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "Warning: backend not ready, skipping auto-setup."
      return 0
    fi
    sleep 2
  done

  # Check if profile already exists
  local exists
  exists=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT count(*) FROM profile WHERE email = '$email';" 2>/dev/null || echo "0")

  if [ "$exists" = "0" ]; then
    echo "Creating default profile ($email)..."
    docker exec -i $CT_BACKEND python3 manage.py create-profile \
      -e "$email" -n "$fullname" -p "$password" 2>/dev/null || true

    # Skip onboarding
    docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c \
      "UPDATE profile SET props = props || '{\"~:viewed-tutorial?\": true, \"~:viewed-walkthrough?\": true, \"~:onboarding-viewed\": true}'::jsonb WHERE email = '$email';" > /dev/null 2>&1

    echo "Test user ready: $email / $password"
  fi
}

_create_mcp_user() {
  local email="$1"
  local password="$2"
  local fullname="$3"

  local exists
  exists=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT count(*) FROM profile WHERE email = '$email';" 2>/dev/null || echo "0")

  if [ "$exists" = "0" ]; then
    echo "Creating MCP profile ($email)..."
    docker exec -i $CT_BACKEND python3 manage.py create-profile \
      -e "$email" -n "$fullname" -p "$password" 2>/dev/null || true

    # Skip onboarding
    docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c \
      "UPDATE profile SET props = props || '{\"~:viewed-tutorial?\": true, \"~:viewed-walkthrough?\": true, \"~:onboarding-viewed\": true}'::jsonb WHERE email = '$email';" > /dev/null 2>&1

    echo "MCP user ready: $email / $password"
  fi
}

_auto_setup_mcp_profiles() {
  _create_mcp_user \
    "${PENPOT_MCP_CLAUDE_EMAIL:-mcp-claude@penpot.local}" \
    "${PENPOT_MCP_CLAUDE_PASSWORD:-mcpclaude123}" \
    "${PENPOT_MCP_CLAUDE_NAME:-Claude Code(MCP)}"

  _create_mcp_user \
    "${PENPOT_MCP_COPILOT_EMAIL:-mcp-copilot@penpot.local}" \
    "${PENPOT_MCP_COPILOT_PASSWORD:-mcpcopilot123}" \
    "${PENPOT_MCP_COPILOT_NAME:-GitHub Copilot(MCP)}"
}

_setup_shared_teams() {
  local team_name="${PENPOT_SHARED_TEAM_NAME:-Shared Workspace}"

  # Check if shared team already exists
  local team_id
  team_id=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT id FROM team WHERE name = '$team_name' AND is_default = false LIMIT 1;" 2>/dev/null)
  team_id=$(echo "$team_id" | tr -d '[:space:]')

  if [ -z "$team_id" ]; then
    # Create shared team via REST API (as Claude MCP user, who is always available)
    local mcp_email="${PENPOT_MCP_CLAUDE_EMAIL:-mcp-claude@penpot.local}"
    local mcp_password="${PENPOT_MCP_CLAUDE_PASSWORD:-mcpclaude123}"

    team_id=$(_run_penpot_api create-team \
      --email "$mcp_email" --password "$mcp_password" \
      --name "$team_name" 2>/dev/null || echo "")

    if [ -z "$team_id" ]; then
      echo "Warning: Could not create shared team."
      return 0
    fi
    echo "Shared team created: $team_name ($team_id)"
  fi

  # Add ALL profiles to the shared team (idempotent)
  docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c "
    INSERT INTO team_profile_rel (team_id, profile_id, is_owner, is_admin, can_edit)
    SELECT '${team_id}'::uuid, p.id, true, true, true
    FROM profile p
    WHERE NOT EXISTS (
      SELECT 1 FROM team_profile_rel r
      WHERE r.team_id = '${team_id}'::uuid AND r.profile_id = p.id
    );
  " > /dev/null 2>&1 && echo "All users added to '$team_name' team." || true

  # Get or create default project in shared team
  local default_project_id
  default_project_id=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT id FROM project WHERE team_id = '${team_id}'::uuid AND is_default = true AND deleted_at IS NULL LIMIT 1;" 2>/dev/null)
  default_project_id=$(echo "$default_project_id" | tr -d '[:space:]')

  if [ -z "$default_project_id" ]; then
    docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c "
      INSERT INTO project (id, team_id, name, is_default, created_at, modified_at)
      VALUES (gen_random_uuid(), '${team_id}'::uuid, 'Drafts', true, now(), now());" > /dev/null 2>&1
    default_project_id=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
      "SELECT id FROM project WHERE team_id = '${team_id}'::uuid AND is_default = true AND deleted_at IS NULL LIMIT 1;" 2>/dev/null)
    default_project_id=$(echo "$default_project_id" | tr -d '[:space:]')
  fi

  # Set shared team as default for all users
  if [ -n "$default_project_id" ]; then
    docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c "
      UPDATE profile
      SET default_team_id = '${team_id}'::uuid,
          default_project_id = '${default_project_id}'::uuid;" > /dev/null 2>&1 \
      && echo "Default team set to '$team_name' for all users." || true
  fi
}

_add_profile_to_shared_team() {
  local email="$1"
  local team_name="${PENPOT_SHARED_TEAM_NAME:-Shared Workspace}"

  local team_id
  team_id=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT id FROM team WHERE name = '$team_name' AND is_default = false LIMIT 1;" 2>/dev/null)
  team_id=$(echo "$team_id" | tr -d '[:space:]')
  [ -z "$team_id" ] && return 0

  # Add to shared team
  docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c "
    INSERT INTO team_profile_rel (team_id, profile_id, is_owner, is_admin, can_edit)
    SELECT '${team_id}'::uuid, p.id, true, true, true
    FROM profile p
    WHERE p.email = '$email'
      AND NOT EXISTS (
        SELECT 1 FROM team_profile_rel r
        WHERE r.team_id = '${team_id}'::uuid AND r.profile_id = p.id
      );" > /dev/null 2>&1

  # Set default team
  local default_project_id
  default_project_id=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT id FROM project WHERE team_id = '${team_id}'::uuid AND is_default = true AND deleted_at IS NULL LIMIT 1;" 2>/dev/null)
  default_project_id=$(echo "$default_project_id" | tr -d '[:space:]')

  if [ -n "$default_project_id" ]; then
    docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c "
      UPDATE profile
      SET default_team_id = '${team_id}'::uuid,
          default_project_id = '${default_project_id}'::uuid
      WHERE email = '$email';" > /dev/null 2>&1
  fi
}

_setup_mcp_workspace() {
  local email="${1}"
  local password="${2}"

  # Check if MCP user already has files via SQL
  local file_count
  file_count=$(docker exec -i $CT_POSTGRES psql -U penpot -d penpot -tAc \
    "SELECT count(*) FROM file f
     JOIN project p ON f.project_id = p.id
     JOIN team t ON p.team_id = t.id
     JOIN team_profile_rel tpr ON t.id = tpr.team_id
     JOIN profile pr ON tpr.profile_id = pr.id
     WHERE pr.email = '$email' AND f.deleted_at IS NULL;" 2>/dev/null || echo "0")

  file_count=$(echo "$file_count" | tr -d '[:space:]')

  if [ "$file_count" != "0" ]; then
    return 0
  fi

  echo "Creating default workspace for MCP user ($email)..."

  local shared_team_name="${PENPOT_SHARED_TEAM_NAME:-Shared Workspace}"
  local file_id
  file_id=$(_run_penpot_api setup-workspace \
    --email "$email" --password "$password" \
    --team-name "$shared_team_name" 2>/dev/null || echo "")

  if [ -n "$file_id" ]; then
    echo "MCP workspace created: file_id=$file_id"
  else
    echo "Warning: Could not create default file for MCP user ($email)."
  fi
}

cmd_down() {
  echo "Stopping Penpot..."
  dc down
}

cmd_status() {
  local sb_profile
  sb_profile=$(_storybook_profile_args)
  dc $sb_profile ps
  echo ""
  # Show MCP connection info if any MCP container is running
  if dc ps --format '{{.Service}}' 2>/dev/null | grep -q penpot-mcp; then
    echo ""
    _show_mcp_info
  else
    echo ""
    echo "MCP server: not running (will start with 'bash penpot-manage.sh up')"
  fi
}

cmd_logs() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    dc logs -f "$service"
  else
    dc logs -f
  fi
}

cmd_build() {
  echo "Building MCP server images..."
  dc build penpot-mcp-claude penpot-mcp-copilot penpot-mcp-connect-claude penpot-mcp-connect-copilot
  echo "MCP images built successfully."
}

cmd_create_profile() {
  local email="${1:-}"
  local fullname="${2:-}"
  local password="${3:-}"

  if [ -z "$email" ] || [ -z "$fullname" ] || [ -z "$password" ]; then
    echo "Creating Penpot user profile (interactive)..."
    read -rp "Email: " email
    read -rp "Full Name: " fullname
    read -rsp "Password: " password
    echo
  fi

  docker exec -i $CT_BACKEND python3 manage.py create-profile \
    -e "$email" -n "$fullname" -p "$password"
  echo "Profile created: $email"

  # Add to shared team and set as default
  _add_profile_to_shared_team "$email"
}

cmd_setup() {
  local email="${1:-dev@example.com}"
  local password="${2:-devdev123}"
  local fullname="${3:-Developer}"

  echo "Quick setup: creating default profile..."
  echo "  Email:    $email"
  echo "  Password: $password"
  echo "  Name:     $fullname"

  # Wait for backend to be ready
  echo "Waiting for backend..."
  local retries=30
  while ! docker exec $CT_BACKEND curl -sf http://localhost:6060/readyz > /dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "Error: backend did not become ready in time."
      exit 1
    fi
    sleep 2
  done

  docker exec -i $CT_BACKEND python3 manage.py create-profile \
    -e "$email" -n "$fullname" -p "$password" 2>/dev/null || true

  # Mark onboarding as completed so "Help us get to know you" is skipped
  docker exec -i $CT_POSTGRES psql -U penpot -d penpot -c \
    "UPDATE profile SET props = props || '{\"~:viewed-tutorial?\": true, \"~:viewed-walkthrough?\": true, \"~:onboarding-viewed\": true}'::jsonb WHERE email = '$email';" > /dev/null 2>&1

  echo ""
  echo "Ready! Open ${PENPOT_PUBLIC_URI:-http://localhost:9001}"
  echo "Login with: $email / $password"
}

cmd_backup() {
  local backup_dir="${1:-$SCRIPT_DIR/penpot-selfhost/backups}"
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$backup_dir"

  echo "Backing up PostgreSQL..."
  docker exec $CT_POSTGRES \
    pg_dump -U penpot penpot | gzip > "$backup_dir/penpot_db_$timestamp.sql.gz"

  echo "Backing up assets..."
  docker run --rm \
    -v $VOL_ASSETS:/data \
    -v "$backup_dir":/backup \
    alpine tar czf "/backup/penpot_assets_$timestamp.tar.gz" -C /data .

  echo "Backup completed: $backup_dir"
  ls -lh "$backup_dir"/penpot_*"$timestamp"*
}

cmd_restore() {
  local db_backup="${1:-}"
  local assets_backup="${2:-}"

  if [ -z "$db_backup" ]; then
    echo "Usage: $0 restore <db_backup.sql.gz> [assets_backup.tar.gz]"
    exit 1
  fi

  echo "Restoring PostgreSQL from $db_backup..."
  gunzip -c "$db_backup" | docker exec -i $CT_POSTGRES \
    psql -U penpot -d penpot

  if [ -n "$assets_backup" ]; then
    echo "Restoring assets from $assets_backup..."
    docker run --rm \
      -v $VOL_ASSETS:/data \
      -v "$(dirname "$assets_backup")":/backup \
      alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$assets_backup") -C /data"
  fi

  echo "Restore completed. Restart Penpot: $0 restart"
}

cmd_restart() {
  local sb_profile
  sb_profile=$(_storybook_profile_args)
  dc $sb_profile up -d --force-recreate
}

cmd_update() {
  local version="${1:-latest}"
  echo "Updating Penpot to version: $version"
  PENPOT_VERSION="$version" dc pull
  PENPOT_VERSION="$version" dc up -d
  echo "Update completed."
}

cmd_mcp_connect() {
  local target="${1:-all}"

  case "$target" in
    claude)
      if ! dc ps --format '{{.Service}}' 2>/dev/null | grep -q penpot-mcp-connect-claude; then
        echo "Error: penpot-mcp-connect-claude is not running."
        echo "Start all services first:  bash $0 up"
        exit 1
      fi
      echo "Restarting MCP auto-connect (Claude)..."
      dc up -d --force-recreate penpot-mcp-connect-claude
      echo "Check logs: bash $0 logs penpot-mcp-connect-claude"
      ;;
    copilot)
      if ! dc ps --format '{{.Service}}' 2>/dev/null | grep -q penpot-mcp-connect-copilot; then
        echo "Error: penpot-mcp-connect-copilot is not running."
        echo "Start all services first:  bash $0 up"
        exit 1
      fi
      echo "Restarting MCP auto-connect (Copilot)..."
      dc up -d --force-recreate penpot-mcp-connect-copilot
      echo "Check logs: bash $0 logs penpot-mcp-connect-copilot"
      ;;
    all)
      local has_service=false
      if dc ps --format '{{.Service}}' 2>/dev/null | grep -q penpot-mcp-connect-claude; then
        has_service=true
        echo "Restarting MCP auto-connect (Claude)..."
        dc up -d --force-recreate penpot-mcp-connect-claude
      fi
      if dc ps --format '{{.Service}}' 2>/dev/null | grep -q penpot-mcp-connect-copilot; then
        has_service=true
        echo "Restarting MCP auto-connect (Copilot)..."
        dc up -d --force-recreate penpot-mcp-connect-copilot
      fi
      if [ "$has_service" = false ]; then
        echo "Error: No MCP connect services are running."
        echo "Start all services first:  bash $0 up"
        exit 1
      fi
      echo "Check logs: bash $0 logs penpot-mcp-connect-claude"
      echo "            bash $0 logs penpot-mcp-connect-copilot"
      ;;
    *)
      echo "Usage: $0 mcp-connect [claude|copilot|all]"
      exit 1
      ;;
  esac
}

cmd_urls() {
  local penpot_uri="${PENPOT_PUBLIC_URI:-http://localhost:${PENPOT_PORT:-9001}}"
  local base
  base=$(echo "$penpot_uri" | sed 's|\(https\?://[^:/]*\).*|\1|')
  echo "Penpot:     $penpot_uri"
  echo "Storybook:  ${base}:${PENPOT_STORYBOOK_PORT:-6006}"
}

cmd_help() {
  local penpot_uri="${PENPOT_PUBLIC_URI:-http://localhost:${PENPOT_PORT:-9001}}"
  local base
  base=$(echo "$penpot_uri" | sed 's|\(https\?://[^:/]*\).*|\1|')
  cat <<EOF
Penpot Self-Host Management

Usage: $0 <command> [args]

Commands:
  up                    Start all services (incl. MCP server + Storybook)
  down                  Stop all services
  restart               Restart all services
  status                Show service status and MCP connection info
  logs [service]        Follow logs (e.g. logs penpot-mcp-claude)
  build                 Rebuild MCP server images (after Dockerfile changes)
  setup [email] [pw] [name]  Quick setup with default profile (dev@example.com / devdev123)
  create-profile [e] [n] [p] Create a user profile (interactive if no args)
  mcp-connect [claude|copilot|all]  Auto-connect MCP plugin via headless Playwright
  urls                  Show service URLs
  backup [dir]          Backup database and assets
  restore <db> [assets] Restore from backup files
  update [version]      Pull and update to a version (default: latest)
  help                  Show this help message

Services:
  Penpot UI:   $penpot_uri
  Storybook:   ${base}:${PENPOT_STORYBOOK_PORT:-6006}
EOF
}

case "${1:-help}" in
  up)             cmd_up ;;
  down)           cmd_down ;;
  restart)        cmd_restart ;;
  status)         cmd_status ;;
  logs)           shift; cmd_logs "$@" ;;
  build)          cmd_build ;;
  setup)          shift; cmd_setup "$@" ;;
  create-profile) shift; cmd_create_profile "$@" ;;
  mcp-connect)    shift; cmd_mcp_connect "$@" ;;
  urls)           cmd_urls ;;
  backup)         shift; cmd_backup "$@" ;;
  restore)        shift; cmd_restore "$@" ;;
  update)         shift; cmd_update "$@" ;;
  help|*)         cmd_help ;;
esac
