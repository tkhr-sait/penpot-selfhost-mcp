FROM node:22-slim

WORKDIR /app/mcp-proxy

COPY mcp-proxy/package.json mcp-proxy/package-lock.json ./
RUN npm ci --production

COPY mcp-proxy/proxy-server.mjs ./
# Penpot auto-init script (skipped when --no-init is passed)
COPY mcp-snippets/penpot-init.js /app/mcp-snippets/

ENTRYPOINT ["node", "proxy-server.mjs"]
