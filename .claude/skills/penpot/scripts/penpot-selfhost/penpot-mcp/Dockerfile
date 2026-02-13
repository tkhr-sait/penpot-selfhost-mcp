# Penpot Official MCP Server (Plugin-Based)
# Multi-stage build: clone from GitHub, build, then create slim runtime image
#
# Architecture:
#   AI Tool (Claude Code / Copilot) --HTTP/SSE--> MCP Server (4401) <--WebSocket--> Browser Plugin
#                              Plugin static files served on port 4400
#
# Build args:
#   PENPOT_REF              - Git ref to checkout (default: develop)
#   PENPOT_MCP_WEBSOCKET_URL - WebSocket URL embedded in plugin at build time
#                              (default: http://localhost:4402)

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

ARG PENPOT_REF=develop
ARG PENPOT_MCP_WEBSOCKET_URL=http://localhost:4402

WORKDIR /build

# Sparse checkout: only mcp/ directory
RUN git clone --depth 1 --filter=blob:none --sparse \
    -b "${PENPOT_REF}" \
    https://github.com/penpot/penpot.git . && \
    git sparse-checkout set mcp

WORKDIR /build/mcp

# Install dependencies and build all packages (common -> server + plugin)
# Note: PENPOT_MCP_WEBSOCKET_URL ARG is available as env var during build
RUN pnpm install --frozen-lockfile && pnpm run build

# =============================================================================
# Stage 2: Runtime
# =============================================================================
FROM node:22-slim

RUN npm install -g serve@14 && npm cache clean --force

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy workspace config
COPY --from=builder /build/mcp/pnpm-workspace.yaml ./
COPY --from=builder /build/mcp/pnpm-lock.yaml ./
COPY --from=builder /build/mcp/package.json ./

# Copy common package
COPY --from=builder /build/mcp/packages/common/package.json ./packages/common/
COPY --from=builder /build/mcp/packages/common/dist/ ./packages/common/dist/

# Copy server package (dist includes index.js, static/, data/)
COPY --from=builder /build/mcp/packages/server/package.json ./packages/server/
COPY --from=builder /build/mcp/packages/server/dist/ ./packages/server/dist/

# Server reads data/ and static/ relative to process.cwd(), so symlink them
# from packages/server/ -> packages/server/dist/ where they actually live
RUN ln -s /app/packages/server/dist/data /app/packages/server/data && \
    ln -s /app/packages/server/dist/static /app/packages/server/static

# Copy plugin build output
COPY --from=builder /build/mcp/packages/plugin/package.json ./packages/plugin/
COPY --from=builder /build/mcp/packages/plugin/dist/ ./packages/plugin/dist/

# Patch manifest.json to add all required permissions (upstream is missing user:read, allow:downloads)
RUN node -e "\
  const m = JSON.parse(require('fs').readFileSync('packages/plugin/dist/manifest.json','utf8'));\
  const need = ['content:read','content:write','library:read','library:write','comment:read','comment:write','user:read','allow:downloads','allow:localstorage'];\
  m.permissions = [...new Set([...m.permissions, ...need])];\
  require('fs').writeFileSync('packages/plugin/dist/manifest.json', JSON.stringify(m, null, 4)+'\n');"

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Environment defaults
ENV PENPOT_MCP_SERVER_LISTEN_ADDRESS=0.0.0.0
ENV PENPOT_MCP_SERVER_PORT=4401
ENV PENPOT_MCP_WEBSOCKET_PORT=4402
ENV PENPOT_MCP_REMOTE_MODE=true
ENV PENPOT_MCP_LOG_LEVEL=info

# Ports: plugin static (4400), MCP HTTP/SSE (4401), WebSocket (4402)
EXPOSE 4400 4401 4402

# Start plugin static server (0.0.0.0 + CORS for cross-origin access from Penpot UI) and MCP server
CMD ["sh", "-c", "serve -s /app/packages/plugin/dist -l tcp://0.0.0.0:4400 --cors & cd /app/packages/server && node dist/index.js"]
