// Increase Node.js HTTP server keepAliveTimeout to prevent
// premature connection close causing MCP tool response loss.
//
// Problem: Default keepAliveTimeout is 5s. When the interval between
// MCP tool calls exceeds 5s, the server closes the idle TCP connection.
// Through Docker's userland proxy, the TCP FIN relay can cause timing
// issues where the server accepts a new request on a new connection
// but the SSE response stream gets lost in the Docker proxy's stale
// connection state.
//
// Fix: Set keepAliveTimeout to 65s (> MCP_TOOL_TIMEOUT of 60s) so
// idle connections survive between typical tool call intervals.
//
// Loaded via NODE_OPTIONS="-r /app/mcp-keepalive.cjs"

const http = require('http');

const KEEP_ALIVE_TIMEOUT = 65000; // 65s — must be > MCP_TOOL_TIMEOUT (60s)
const HEADERS_TIMEOUT = 70000;    // 70s — must be > keepAliveTimeout (Node.js requirement)

const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
  this.headersTimeout = HEADERS_TIMEOUT;
  return origListen.apply(this, args);
};
