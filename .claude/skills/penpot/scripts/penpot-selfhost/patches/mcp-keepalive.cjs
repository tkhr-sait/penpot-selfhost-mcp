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
// Fix: Set keepAliveTimeout to 120s (2x MCP_TOOL_TIMEOUT of 60s) so
// idle connections survive between typical tool call intervals.
//
// Additionally, inject SSE heartbeat comments (`:heartbeat\n\n`) every
// 15s on text/event-stream responses to keep long-lived SSE connections
// alive through Docker proxy, conntrack tables, and network devices.
//
// Loaded via NODE_OPTIONS="-r /app/mcp-keepalive.cjs"

const http = require('http');

const KEEP_ALIVE_TIMEOUT = 120000; // 120s — 2x MCP_TOOL_TIMEOUT (60s)
const HEADERS_TIMEOUT = 125000;    // 125s — must be > keepAliveTimeout (Node.js requirement)
const SSE_HEARTBEAT_INTERVAL = 15000; // 15s

// --- Phase 1-B: keepAliveTimeout increase ---
const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
  this.headersTimeout = HEADERS_TIMEOUT;
  return origListen.apply(this, args);
};

// --- Phase 1-A: SSE heartbeat injection ---
const origWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (statusCode, ...rest) {
  // Detect Content-Type from arguments (can be in headers object or statusMessage+headers)
  let contentType = null;
  for (const arg of rest) {
    if (arg && typeof arg === 'object') {
      // Headers object — keys may be any case
      for (const [key, value] of Object.entries(arg)) {
        if (key.toLowerCase() === 'content-type') {
          contentType = value;
          break;
        }
      }
    }
  }

  const result = origWriteHead.call(this, statusCode, ...rest);

  // Start heartbeat for SSE responses
  if (contentType && typeof contentType === 'string' && contentType.includes('text/event-stream')) {
    const res = this;
    const timer = setInterval(() => {
      if (res.destroyed || res.writableEnded) {
        clearInterval(timer);
        return;
      }
      try {
        res.write(':heartbeat\n\n');
      } catch {
        clearInterval(timer);
      }
    }, SSE_HEARTBEAT_INTERVAL);

    // Clean up on close/finish
    const cleanup = () => clearInterval(timer);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  }

  return result;
};
