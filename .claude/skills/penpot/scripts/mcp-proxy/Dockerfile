FROM node:22-slim

WORKDIR /app/mcp-proxy

COPY package.json package-lock.json ./
RUN npm ci --production

COPY proxy-server.mjs ./

ENTRYPOINT ["node", "proxy-server.mjs"]
