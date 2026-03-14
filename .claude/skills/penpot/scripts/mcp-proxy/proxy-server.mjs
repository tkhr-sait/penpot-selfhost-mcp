#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// --- CLI argument parsing ---
function getArg(name, def) {
  const a = process.argv.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const env = (key, def) => process.env[key] || def;

// --- Configuration (CLI > env > default) ---
const UPSTREAM_URL = getArg("upstream", "") || env("MCP_UPSTREAM", "");
if (!UPSTREAM_URL) {
  console.error("[mcp-proxy] --upstream=URL or MCP_UPSTREAM is required");
  process.exit(1);
}
const SERVER_NAME = getArg("name", "") || env("MCP_NAME", "mcp-proxy");
const SKILL_NAME = getArg("skill", "") || env("MCP_SKILL", "");
const GATE_ENABLED = !!SKILL_NAME;

const NO_INIT =
  hasFlag("no-init") || env("MCP_NO_INIT", "") === "true";
const INIT_TOOL =
  getArg("init-tool", "") || env("MCP_INIT_TOOL", "execute_code");

// init.d ディレクトリ自動検出（後方互換: 単一ファイル/カンマ区切りも可）
const INIT_DIR = getArg("init-dir", "") || env("MCP_INIT_DIR", "");
const INIT_SCRIPTS = NO_INIT ? [] : (() => {
  if (INIT_DIR && existsSync(INIT_DIR)) {
    return readdirSync(INIT_DIR)
      .filter(f => f.endsWith('.js'))
      .sort()
      .map(f => join(INIT_DIR, f));
  }
  // 後方互換: MCP_INIT_SCRIPT（単一 or カンマ区切り）
  const s = getArg("init-script", "") || env("MCP_INIT_SCRIPT", "") || "";
  return s.split(",").map(x => x.trim()).filter(Boolean);
})();

const RETRY_ATTEMPTS = parseInt(getArg("retry-attempts", "") || env("MCP_RETRY_ATTEMPTS", "3"), 10);
const RETRY_DELAY = parseInt(getArg("retry-delay", "") || env("MCP_RETRY_DELAY", "1000"), 10);
const SCHEMA_FETCH_COOLDOWN = parseInt(getArg("schema-cooldown", "") || env("MCP_SCHEMA_COOLDOWN", "10000"), 10);
const UPSTREAM_TIMEOUT = parseInt(getArg("upstream-timeout", "") || env("MCP_UPSTREAM_TIMEOUT", "55000"), 10);

const TOOLS_ARG = getArg("tools", "") || env("MCP_TOOLS", "*");
const TOOL_WILDCARD = TOOLS_ARG === "*";
const TOOL_LIST = TOOL_WILDCARD
  ? []
  : TOOLS_ARG.split(",").map((t) => t.trim());

// --- State ---
let upstream = null; // Client instance
let unlocked = false;
let initDone = false;

// --- Upstream callTool with timeout (Phase 3) ---
async function callToolWithTimeout(client, toolReq) {
  return Promise.race([
    client.callTool(toolReq),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(
        `上流 MCP タイムアウト (${UPSTREAM_TIMEOUT}ms): ${toolReq.name}`
      )), UPSTREAM_TIMEOUT)
    ),
  ]);
}

// --- Error text extraction (MCP SDK returns content without isError) ---
function getResultErrorText(result) {
  const text = result?.content?.find(c => c.type === "text")?.text;
  if (!text) return null;
  // Upstream wraps errors as "Tool execution failed: Error: ..." or "Error handling task: ..."
  if (text.startsWith("Tool execution failed:") || text.startsWith("Error handling task:")) return text;
  return null;
}

// --- Pattern matchers (shared between result-based and exception-based detection) ---
function matchesStorageUninit(text) {
  return text.includes("storage.") && text.includes("is not a function");
}
function matchesPluginDisconnected(text) {
  return text.includes("No Penpot plugin instances") || text.includes("not currently connected");
}

// --- Storage uninit detection (WS reconnect causes empty storage) ---
function isStorageUninitError(result) {
  const text = getResultErrorText(result);
  return text ? matchesStorageUninit(text) : false;
}

// --- Plugin disconnected detection ---
function isPluginDisconnected(result) {
  const text = getResultErrorText(result);
  return text ? matchesPluginDisconnected(text) : false;
}

// --- Wait for plugin reconnection (mcp-connect auto-reconnects) ---
async function waitForPluginReconnect(maxWait = 30000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const probe = await callToolWithTimeout(upstream, {
        name: INIT_TOOL,
        arguments: { code: "return 'ok'" },
      });
      if (!isPluginDisconnected(probe)) return true;
    } catch { /* upstream error, keep waiting */ }
  }
  return false;
}

// --- Upstream connection (new or reconnect) ---
async function connectUpstream() {
  if (upstream) {
    try {
      await upstream.close();
    } catch {
      // ignore cleanup errors
    }
    upstream = null;
  }
  const client = new Client({
    name: `${SERVER_NAME}-proxy`,
    version: "1.0.0",
  });

  // Try StreamableHTTP first, fall back to SSE
  // When UPSTREAM_URL points to /sse, try StreamableHTTP at /mcp path instead
  let connected = false;
  try {
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    const streamableUrl = new URL(UPSTREAM_URL);
    if (streamableUrl.pathname.endsWith("/sse")) {
      streamableUrl.pathname = streamableUrl.pathname.replace(/\/sse$/, "/mcp");
    }
    await client.connect(
      new StreamableHTTPClientTransport(streamableUrl)
    );
    connected = true;
    console.error(`[mcp-proxy] connected via StreamableHTTP: ${streamableUrl}`);
  } catch {
    // StreamableHTTP not available or failed — fall back to SSE
  }
  if (!connected) {
    await client.connect(new SSEClientTransport(new URL(UPSTREAM_URL)));
    console.error(`[mcp-proxy] connected via SSE: ${UPSTREAM_URL}`);
  }
  client.onclose = () => {
    console.error("[mcp-proxy] upstream closed");
    if (upstream === client) { upstream = null; initDone = false; }
  };
  client.onerror = (err) => {
    console.error("[mcp-proxy] upstream error:", err?.message ?? err);
  };
  return client;
}

// --- Connect with retry (exponential backoff) ---
async function connectWithRetry(attempts = RETRY_ATTEMPTS, baseDelay = RETRY_DELAY) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connectUpstream();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        const delay = baseDelay * 2 ** i;
        console.error(`[mcp-proxy] connect attempt ${i + 1}/${attempts} failed, retry in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// --- Reconnect lock (prevent concurrent reconnection) ---
let reconnectLock = null;

async function reconnectOnce(useRetry = false) {
  if (reconnectLock) return reconnectLock;
  reconnectLock = (async () => {
    try {
      upstream = useRetry ? await connectWithRetry() : await connectUpstream();
      if (!upstreamToolsCache) await cacheUpstreamTools();
      await autoInit(true);
    } catch (e) {
      upstream = null;
      throw e;
    } finally {
      reconnectLock = null;
    }
  })();
  return reconnectLock;
}

// --- Auto-init (re-run on reconnect, returns result for activate response) ---
// 1ファイル1 execute_code でサイズ制限リスクを回避
async function autoInit(force = false) {
  if (INIT_SCRIPTS.length === 0) {
    initDone = true;
    return null;
  }
  if (initDone && !force) return null;
  let lastResult = null;
  for (const script of INIT_SCRIPTS) {
    if (!existsSync(script)) {
      console.error(`[mcp-proxy] Init script not found: ${script}`);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `初期化スクリプトが見つかりません: ${script}`,
          },
        ],
      };
    }
    const code = readFileSync(script, "utf-8");
    const result = await callToolWithTimeout(upstream, {
      name: INIT_TOOL,
      arguments: { code },
    });
    if (getResultErrorText(result)) return result;
    lastResult = result;
  }
  initDone = true;
  return lastResult; // 最後のスクリプト（90-core.js）の return 値
}

// --- Format init result for activate response ---
function formatInitResult(initResult) {
  if (!initResult) return "";
  const initText = initResult.content?.find((c) => c.type === "text")?.text;
  if (getResultErrorText(initResult))
    return `\n\n⚠ 初期化エラー:\n${initText || "不明"}`;
  return initText ? `\n\n${initText}` : "";
}

// --- Create server ---
const server = new Server(
  { name: SERVER_NAME, version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions: SKILL_NAME
      ? `${SERVER_NAME} の操作には ${SKILL_NAME} スキルのロードが必要です。\nスキルロード後、activate で MCP セッションを開始してください。\n上流切断時は activate を再度呼び出してください。`
      : `${SERVER_NAME} MCP プロキシ。上流に透過転送します。`,
  }
);

// --- Upstream tools schema cache ---
let upstreamToolsCache = null;
let schemaFetchLastAttempt = 0;

async function cacheUpstreamTools() {
  const result = await upstream.listTools();
  upstreamToolsCache = {};
  for (const tool of result.tools) {
    upstreamToolsCache[tool.name] = tool;
  }
}

// Eagerly fetch upstream schemas (best-effort, no gate unlock)
async function ensureSchemaCache() {
  if (upstreamToolsCache) return;
  const now = Date.now();
  if (now - schemaFetchLastAttempt < SCHEMA_FETCH_COOLDOWN) return;
  schemaFetchLastAttempt = now;
  try {
    const client = await connectUpstream();
    upstream = client;
    await cacheUpstreamTools();
  } catch {
    // Upstream not ready yet — fall back to placeholder schemas
  }
}

// --- Tool definitions ---
const ACTIVATE_TOOL = {
  name: "activate",
  description:
    `${SERVER_NAME} MCP セッションを開始/再接続する。` +
    (SKILL_NAME ? `\n${SKILL_NAME} スキルロード後に呼び出すこと。` : "") +
    (INIT_SCRIPTS.length === 0 ? "" : `\n初期化スクリプトを自動実行（${INIT_SCRIPTS.length}ファイル）。`),
  inputSchema: { type: "object", properties: {} },
};

const WORKFLOW_SUFFIX = GATE_ENABLED
  ? "\n[WORKFLOW] 使用前に activate ツールの呼び出しが必要。"
  : "";

// Known upstream tool schemas (fallback until real schemas are fetched)
const KNOWN_SCHEMAS = {
  execute_code: {
    type: "object",
    properties: {
      code: { type: "string", description: "The JavaScript code to execute in the plugin context." },
    },
    required: ["code"],
  },
  export_shape: {
    type: "object",
    properties: {
      shapeId: { type: "string", description: "Identifier of the shape to export. Use 'selection' to export the first selected shape." },
      format: { type: "string", enum: ["svg", "png"], default: "png", description: "Output format: 'png' (default) or 'svg'." },
      mode: { type: "string", enum: ["shape", "fill"], default: "shape", description: "Export mode: 'shape' (full shape) or 'fill' (raw image data from fill)." },
    },
    required: ["shapeId"],
  },
  penpot_api_info: {
    type: "object",
    properties: {
      type: { type: "string", description: "Type name to look up." },
      member: { type: "string", description: "Optional member name within the type." },
    },
    required: ["type"],
  },
  high_level_overview: {
    type: "object",
    properties: {},
  },
};

// Build fallback tool definitions (before activate, gate mode only)
function buildFallbackTools() {
  if (!GATE_ENABLED || TOOL_WILDCARD) return [];
  return TOOL_LIST.map((name) => ({
    name,
    description: `${SERVER_NAME} ツール (${name})。` + WORKFLOW_SUFFIX,
    inputSchema: KNOWN_SCHEMAS[name] || { type: "object", properties: {} },
  }));
}

const FALLBACK_TOOLS = buildFallbackTools();

// --- tools/list ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Eagerly fetch real schemas on first tools/list call
  await ensureSchemaCache();

  const tools = [];

  if (GATE_ENABLED) {
    tools.push(ACTIVATE_TOOL);
  }

  if (upstreamToolsCache) {
    if (TOOL_WILDCARD) {
      // Expose all upstream tools
      for (const tool of Object.values(upstreamToolsCache)) {
        tools.push({
          ...tool,
          description: (tool.description || "") + WORKFLOW_SUFFIX,
        });
      }
    } else {
      // Expose only whitelisted tools
      for (const name of TOOL_LIST) {
        const tool = upstreamToolsCache[name];
        if (tool) {
          tools.push({
            ...tool,
            description: (tool.description || "") + WORKFLOW_SUFFIX,
          });
        }
      }
    }
  } else if (GATE_ENABLED) {
    tools.push(...FALLBACK_TOOLS);
  }

  return { tools };
});

// --- tools/call ---
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  // --- activate (idempotent, gate mode only) ---
  if (name === "activate") {
    if (unlocked && upstream !== null) {
      await server.sendToolListChanged();
      // Re-run init (idempotent in plugin env) to return summary for context recovery
      const initResult = await autoInit(true);
      return {
        content: [
          {
            type: "text",
            text: `Already activated.${formatInitResult(initResult)}`,
          },
        ],
      };
    }
    try {
      // Reuse existing upstream connection from ensureSchemaCache if available
      if (!upstream) {
        upstream = await connectWithRetry();
      }
      if (!upstreamToolsCache) {
        await cacheUpstreamTools();
      }
      const initResult = await autoInit(!initDone ? false : true);
      unlocked = true;
      // Notify Claude Code that real tool schemas are now available
      await server.sendToolListChanged();
      return {
        content: [
          {
            type: "text",
            text: `${SERVER_NAME} MCP activated. Ready.${formatInitResult(initResult)}`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `上流 MCP への接続に失敗しました。\n` +
              `エラー: ${e.message}\n` +
              `URL: ${UPSTREAM_URL}\n\n` +
              `activate を再度呼び出して再接続してください。` +
              `解決しない場合は upstream URL やネットワーク設定を確認してください。`,
          },
        ],
        isError: true,
      };
    }
  }

  // --- Transparent mode: auto-connect on first call ---
  if (!GATE_ENABLED && !upstream) {
    try {
      upstream = await connectWithRetry();
      await cacheUpstreamTools();
      await autoInit(false);
      unlocked = true;
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `上流 MCP への接続に失敗しました。\n` +
              `エラー: ${e.message}\n` +
              `URL: ${UPSTREAM_URL}\n\n` +
              `上流サービスの起動状態と URL 設定を確認してください。`,
          },
        ],
        isError: true,
      };
    }
  }

  // --- Gate check (gate mode only) ---
  if (GATE_ENABLED && !unlocked) {
    return {
      content: [
        {
          type: "text",
          text:
            `${SERVER_NAME} MCP セッションが未開始です。\n` +
            `先に activate ツールを呼び出してセッションを開始してください。` +
            (SKILL_NAME
              ? `\n（前提: ${SKILL_NAME} スキルのロード）`
              : ""),
        },
      ],
      isError: true,
    };
  }

  // --- Tool whitelist check (skip for wildcard) ---
  if (!TOOL_WILDCARD && !TOOL_LIST.includes(name)) {
    return {
      content: [
        {
          type: "text",
          text: `${SERVER_NAME}: ツール "${name}" は公開されていません。`,
        },
      ],
      isError: true,
    };
  }

  // --- Forward to upstream ---
  try {
    const result = await callToolWithTimeout(upstream, { name, arguments: args });
    // storage メソッド消失検出: WS 再接続で storage が空になった場合、init 再実行で復旧
    if (isStorageUninitError(result)) {
      console.error("[mcp-proxy] storage uninit detected, re-running autoInit + retry");
      const initResult = await autoInit(true);
      if (initResult && getResultErrorText(initResult)) return initResult;
      return await callToolWithTimeout(upstream, { name, arguments: args });
    }
    // プラグイン切断検出: mcp-connect の自動再接続を待機 → autoInit → リトライ
    if (isPluginDisconnected(result)) {
      console.error("[mcp-proxy] plugin disconnected, waiting for auto-reconnect...");
      const reconnected = await waitForPluginReconnect(60000, 3000);
      if (reconnected) {
        console.error("[mcp-proxy] plugin reconnected, re-running autoInit + retry");
        const initResult = await autoInit(true);
        if (initResult && getResultErrorText(initResult)) return initResult;
        return await callToolWithTimeout(upstream, { name, arguments: args });
      }
      console.error("[mcp-proxy] plugin reconnect timed out");
    }
    return result;
  } catch (e) {
    // Upstream disconnected (keep unlocked, don't re-lock)
    const stale = upstream;
    upstream = null;
    initDone = false;
    if (stale) { try { await stale.close(); } catch {} }

    // プラグイン切断検出: mcp-connect の自動再接続を待機 → autoInit → リトライ
    console.error(`[mcp-proxy] catch: ${e.message?.substring(0, 150)}`);
    const errText = e.message || "";
    const isPluginErr = matchesPluginDisconnected(errText);
    const isStorageErr = matchesStorageUninit(errText);
    if (isStorageErr) {
      console.error("[mcp-proxy] storage uninit (thrown), reconnecting + autoInit");
      try {
        if (!upstream) upstream = await connectWithRetry();
        const initResult = await autoInit(true);
        if (initResult && getResultErrorText(initResult)) return initResult;
        return await callToolWithTimeout(upstream, { name, arguments: args });
      } catch (reconnectErr) {
        console.error("[mcp-proxy] storage recovery failed:", reconnectErr.message);
        upstream = null;
      }
    } else if (isPluginErr) {
      console.error("[mcp-proxy] plugin disconnected (thrown), waiting for auto-reconnect...");
      try {
        if (!upstream) upstream = await connectWithRetry();
        const reconnected = await waitForPluginReconnect(60000, 3000);
        if (reconnected) {
          console.error("[mcp-proxy] plugin reconnected, re-running autoInit + retry");
          const initResult = await autoInit(true);
          if (initResult && getResultErrorText(initResult)) return initResult;
          return await callToolWithTimeout(upstream, { name, arguments: args });
        } else {
          console.error("[mcp-proxy] plugin reconnect timed out");
        }
      } catch (reconnectErr) {
        console.error("[mcp-proxy] reconnect failed:", reconnectErr.message);
        upstream = null;
      }
    } else {
      // 通常の upstream 切断: fast-fail or リトライ
      try {
        await reconnectOnce(!GATE_ENABLED);
        return await callToolWithTimeout(upstream, { name, arguments: args });
      } catch (reconnectErr) {
        upstream = null;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: GATE_ENABLED
            ? `上流 MCP が切断されました。\n` +
              `エラー: ${e.message}\n\n` +
              `activate を呼び出して再接続してください。` +
              `解決しない場合は上流サービスの状態を確認してください。`
            : `上流 MCP が切断され、自動再接続にも失敗しました。\n` +
              `エラー: ${e.message}\n\n` +
              `上流サービスの状態と URL 設定を確認してください。`,
        },
      ],
      isError: true,
    };
  }
});

// --- Graceful shutdown ---
async function shutdown() {
  if (upstream) {
    try {
      await upstream.close();
    } catch {
      /* ignore */
    }
    upstream = null;
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// stdin 切断でプロセス終了（Claude Code が MCP 再接続すると古い stdin が閉じられる）
process.stdin.on("end", shutdown);

process.on("uncaughtException", (e) => {
  console.error("[mcp-proxy] uncaught exception:", e.message);
});
process.on("unhandledRejection", (e) => {
  console.error("[mcp-proxy] unhandled rejection:", e);
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
