FROM node:22-slim

# Playwright system deps + socat (WS proxy)
RUN apt-get update && \
    apt-get install -y --no-install-recommends socat && \
    npx playwright install-deps chromium-headless-shell && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

# Playwright headless Chromium
RUN npx playwright install chromium-headless-shell

COPY mcp-connect.mjs ./
COPY penpot-api.mjs ./

ENV PLAYWRIGHT_HEADLESS=1
ENV MCP_SERVICE_NAME=penpot-mcp-claude

# socat proxies:
#   9001 → penpot-frontend:8080  (Penpot public URI; export downloads use localhost:9001)
#   4400 → ${MCP_SERVICE_NAME}:4400  (plugin static files)
#   4402 → ${MCP_SERVICE_NAME}:4402  (WebSocket)
# Required because plugin iframe/JS uses localhost URLs inside the browser
# mcp-connect.mjs: runs in foreground
CMD ["sh", "-c", "socat TCP-LISTEN:9001,fork,reuseaddr TCP:penpot-frontend:8080 & socat TCP-LISTEN:4400,fork,reuseaddr TCP:${MCP_SERVICE_NAME}:4400 & socat TCP-LISTEN:4402,fork,reuseaddr TCP:${MCP_SERVICE_NAME}:4402 & exec node mcp-connect.mjs"]
