#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INIT_SCRIPT = resolve(__dirname, "../mcp-snippets/penpot-init.js");
const UPSTREAM_URL =
  process.argv.find((a) => a.startsWith("--upstream="))?.split("=")[1] ||
  "http://localhost:4401/mcp";

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
  const client = new Client({ name: "penpot-proxy", version: "1.0.0" });

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
  if (initDone && !force) return;
  const code = readFileSync(INIT_SCRIPT, "utf-8");
  const result = await upstream.callTool({
    name: "execute_code",
    arguments: { code },
  });
  if (!result.isError) initDone = true;
}

// --- Create server ---
const server = new Server(
  { name: "penpot-official", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Penpot操作には /penpot スキルのロードが必要です。\n" +
      "スキルロード後、activate で MCP セッションを開始してください。\n" +
      "上流切断時は activate を再度呼び出してください。",
  }
);

// --- Upstream tools schema cache ---
let upstreamToolsCache = null;

async function cacheUpstreamTools() {
  const result = await upstream.listTools();
  upstreamToolsCache = {};
  for (const tool of result.tools) {
    upstreamToolsCache[tool.name] = tool;
  }
}

// --- Tool definitions ---
const ACTIVATE_TOOL = {
  name: "activate",
  description:
    "Penpot MCP セッションを開始/再接続する。" +
    "スキルロード後に呼び出すこと。penpot-init.js を自動実行。",
  inputSchema: { type: "object", properties: {} },
};

const WORKFLOW_SUFFIX =
  "\n[WORKFLOW] activate が未呼び出しの場合はエラー。";

const EXPOSED_TOOLS = [
  "execute_code",
  "export_shape",
  "penpot_api_info",
  "high_level_overview",
];

// Fallback tool definitions (before activate)
const FALLBACK_TOOLS = [
  {
    name: "execute_code",
    description: "Penpot プラグインで JavaScript を実行。" + WORKFLOW_SUFFIX,
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", minLength: 1 } },
      required: ["code"],
    },
  },
  {
    name: "export_shape",
    description: "シェイプを PNG/SVG にエクスポート。" + WORKFLOW_SUFFIX,
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string", minLength: 1 },
        format: { type: "string", enum: ["png", "svg"], default: "png" },
        mode: { type: "string", enum: ["shape", "fill"], default: "shape" },
      },
      required: ["shapeId"],
    },
  },
  {
    name: "penpot_api_info",
    description: "Penpot API の型情報を取得。" + WORKFLOW_SUFFIX,
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", minLength: 1 },
        member: { type: "string" },
      },
      required: ["type"],
    },
  },
  {
    name: "high_level_overview",
    description: "Penpot Plugin API の概要を取得。" + WORKFLOW_SUFFIX,
    inputSchema: { type: "object", properties: {} },
  },
];

// --- tools/list ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [ACTIVATE_TOOL];

  if (upstreamToolsCache) {
    for (const name of EXPOSED_TOOLS) {
      const tool = upstreamToolsCache[name];
      if (tool) {
        tools.push({
          ...tool,
          description: (tool.description || "") + WORKFLOW_SUFFIX,
        });
      }
    }
  } else {
    tools.push(...FALLBACK_TOOLS);
  }

  return { tools };
});

// --- tools/call ---
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  // --- activate (idempotent) ---
  if (name === "activate") {
    if (unlocked && upstream !== null) {
      return {
        content: [{ type: "text", text: "Already activated." }],
      };
    }
    try {
      upstream = await connectUpstream();
      await cacheUpstreamTools();
      await autoInit(!initDone ? false : true);
      unlocked = true;
      return {
        content: [{ type: "text", text: "Penpot MCP activated. Ready." }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `上流 MCP に接続できません: ${e.message}\n` +
              `URL: ${UPSTREAM_URL}\n` +
              `Docker が起動しているか確認してください。`,
          },
        ],
        isError: true,
      };
    }
  }

  // --- Gate check ---
  if (!unlocked) {
    return {
      content: [
        {
          type: "text",
          text:
            "Penpot スキルがロードされていません。\n" +
            "/penpot スキルを実行してから再試行してください。",
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
    return {
      content: [
        {
          type: "text",
          text:
            "上流 MCP が切断されました。\n" +
            "activate を呼び出して再接続してください。",
        },
      ],
      isError: true,
    };
  }
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
