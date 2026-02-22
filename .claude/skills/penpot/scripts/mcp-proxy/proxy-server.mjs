#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFileSync, existsSync } from "node:fs";

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
const INIT_SCRIPT = NO_INIT
  ? null
  : getArg("init-script", "") || env("MCP_INIT_SCRIPT", "") || null;
const INIT_TOOL =
  getArg("init-tool", "") || env("MCP_INIT_TOOL", "execute_code");

const TOOLS_ARG = getArg("tools", "") || env("MCP_TOOLS", "*");
const TOOL_WILDCARD = TOOLS_ARG === "*";
const TOOL_LIST = TOOL_WILDCARD
  ? []
  : TOOLS_ARG.split(",").map((t) => t.trim());

// --- State ---
let upstream = null; // Client instance
let unlocked = false;
let initDone = false;

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
  let connected = false;
  try {
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(UPSTREAM_URL))
    );
    connected = true;
  } catch {
    // StreamableHTTP not available or failed
  }
  if (!connected) {
    await client.connect(new SSEClientTransport(new URL(UPSTREAM_URL)));
  }
  return client;
}

// --- Auto-init (re-run on reconnect) ---
async function autoInit(force = false) {
  if (!INIT_SCRIPT) {
    initDone = true;
    return;
  }
  if (initDone && !force) return;
  if (!existsSync(INIT_SCRIPT)) {
    console.error(`[mcp-proxy] Init script not found: ${INIT_SCRIPT}`);
    console.error("[mcp-proxy] Check volume mount or --init-script path.");
    initDone = true;
    return;
  }
  const code = readFileSync(INIT_SCRIPT, "utf-8");
  const result = await upstream.callTool({
    name: INIT_TOOL,
    arguments: { code },
  });
  if (!result.isError) initDone = true;
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
let schemaFetchAttempted = false;

async function cacheUpstreamTools() {
  const result = await upstream.listTools();
  upstreamToolsCache = {};
  for (const tool of result.tools) {
    upstreamToolsCache[tool.name] = tool;
  }
}

// Eagerly fetch upstream schemas (best-effort, no gate unlock)
async function ensureSchemaCache() {
  if (upstreamToolsCache || schemaFetchAttempted) return;
  schemaFetchAttempted = true;
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
    (NO_INIT || !INIT_SCRIPT ? "" : "\n初期化スクリプトを自動実行。"),
  inputSchema: { type: "object", properties: {} },
};

const WORKFLOW_SUFFIX = GATE_ENABLED
  ? "\n[WORKFLOW] activate が未呼び出しの場合はエラー。"
  : "";

// Build fallback tool definitions (before activate, gate mode only)
function buildFallbackTools() {
  if (!GATE_ENABLED || TOOL_WILDCARD) return [];
  return TOOL_LIST.map((name) => ({
    name,
    description: `${SERVER_NAME} ツール (${name})。` + WORKFLOW_SUFFIX,
    inputSchema: { type: "object", properties: {} },
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
      // Notify Claude Code to re-fetch tool schemas (may be stale from fallback)
      await server.sendToolListChanged();
      return {
        content: [{ type: "text", text: "Already activated." }],
      };
    }
    try {
      upstream = await connectUpstream();
      await cacheUpstreamTools();
      await autoInit(!initDone ? false : true);
      unlocked = true;
      // Notify Claude Code that real tool schemas are now available
      await server.sendToolListChanged();
      return {
        content: [
          { type: "text", text: `${SERVER_NAME} MCP activated. Ready.` },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `上流 MCP に接続できません: ${e.message}\n` +
              `URL: ${UPSTREAM_URL}\n` +
              `上流サービスが起動しているか確認してください。`,
          },
        ],
        isError: true,
      };
    }
  }

  // --- Transparent mode: auto-connect on first call ---
  if (!GATE_ENABLED && !upstream) {
    try {
      upstream = await connectUpstream();
      await cacheUpstreamTools();
      await autoInit(false);
      unlocked = true;
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `上流 MCP に接続できません: ${e.message}\n` +
              `URL: ${UPSTREAM_URL}`,
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
            `${SERVER_NAME} スキルがロードされていません。\n` +
            `${SKILL_NAME} スキルを実行してから再試行してください。`,
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
    return await upstream.callTool({ name, arguments: args });
  } catch (e) {
    // Upstream disconnected (keep unlocked, don't re-lock)
    upstream = null;
    initDone = false;

    // Transparent mode: try auto-reconnect once
    if (!GATE_ENABLED) {
      try {
        upstream = await connectUpstream();
        await cacheUpstreamTools();
        await autoInit(false);
        return await upstream.callTool({ name, arguments: args });
      } catch {
        upstream = null;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: GATE_ENABLED
            ? "上流 MCP が切断されました。\nactivate を呼び出して再接続してください。"
            : "上流 MCP が切断され、自動再接続にも失敗しました。\n上流サービスの状態を確認してください。",
        },
      ],
      isError: true,
    };
  }
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
