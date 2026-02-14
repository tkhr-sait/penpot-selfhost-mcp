#!/usr/bin/env node
/**
 * Penpot MCP Auto-Connect via Playwright (headless)
 *
 * Automates: login → ensure workspace file → install plugin → connect MCP → keep alive
 *
 *
 * Environment variables:
 *   PENPOT_PUBLIC_URI          (default: http://localhost:9001)
 *   PENPOT_MCP_EMAIL           (default: mcp@penpot.local)  — MCP dedicated user
 *   PENPOT_MCP_PASSWORD        (default: mcpmcp123)         — MCP dedicated user
 *   PENPOT_DEFAULT_EMAIL       (fallback if MCP user not set)
 *   PENPOT_DEFAULT_PASSWORD    (fallback if MCP user not set)
 *   PENPOT_MCP_PLUGIN_PORT     (default: 4400)
 *   PENPOT_MCP_MANIFEST_HOST   (default: localhost) — hostname for manifest URL
 *   PENPOT_MCP_MANIFEST_URL    (override full manifest URL)
 *   PENPOT_MCP_DEBUG_DIR       (default: /tmp) — debug artifact output directory
 *
 * Usage:
 *   node scripts/mcp-connect.mjs
 *
 * Architecture notes:
 *   - Runs fully headless (no Xvfb/VNC required).
 *   - After login, uses Penpot REST API (via browser session cookies) to
 *     find or create the workspace file, then navigates directly to the
 *     workspace URL. This avoids fragile dashboard UI interaction.
 *
 * Troubleshooting / known gotchas:
 *   - REST API returns Transit JSON by default. Always send
 *     `Accept: application/json` to get standard JSON responses.
 *   - File listing endpoint is `get-project-files` (NOT `get-files`).
 *   - The plugin permission dialog's "Allow" button is rendered uppercase
 *     via CSS text-transform. Use `page.getByRole('button', { name: /allow/i })`
 *     instead of text-based selectors like `has-text("Allow")`.
 *   - Playwright's Chromium triggers SES lockdown in plugin iframes, which
 *     breaks transit-js. A `Object.defineProperty` wrapper is applied before
 *     opening the plugin to suppress "not extensible" errors.
 *   - On failure, debug artifacts are saved automatically:
 *       $PENPOT_MCP_DEBUG_DIR/mcp-connect-error.{png,html}   — final error state
 *       $PENPOT_MCP_DEBUG_DIR/mcp-install-debug.{png,html}    — Allow dialog detection failure
 *     Use `Read` tool on the PNG for visual inspection.
 */

import { chromium } from "playwright";
import http from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PENPOT_URI = process.env.PENPOT_PUBLIC_URI || "http://localhost:9001";
const EMAIL = process.env.PENPOT_MCP_EMAIL || process.env.PENPOT_DEFAULT_EMAIL || "mcp@penpot.local";
const PASSWORD = process.env.PENPOT_MCP_PASSWORD || process.env.PENPOT_DEFAULT_PASSWORD || "mcpmcp123";
const PLUGIN_PORT = process.env.PENPOT_MCP_PLUGIN_PORT || "4400";
const SHARED_TEAM_NAME = process.env.PENPOT_SHARED_TEAM_NAME || "Shared Workspace";
const MANIFEST_HOST = process.env.PENPOT_MCP_MANIFEST_HOST || "localhost";
const MANIFEST_URL = process.env.PENPOT_MCP_MANIFEST_URL
  || `http://${MANIFEST_HOST}:${PLUGIN_PORT}/manifest.json`;
const HEADLESS = true;
const DEBUG_DIR = process.env.PENPOT_MCP_DEBUG_DIR || "/tmp";

// Timeouts
const SERVICE_POLL_INTERVAL = 2000;
const SERVICE_POLL_TIMEOUT = 120_000;
const NAV_TIMEOUT = 30_000;
const PLUGIN_ACTION_TIMEOUT = 15_000;
const LOGIN_RETRY_INTERVAL = 5000;
const LOGIN_RETRY_TIMEOUT = 300_000;
const MONITOR_INTERVAL = 5000;       // Plugin connection check interval
const RECONNECT_COOLDOWN = 15000;    // Cooldown after reconnect

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll a URL until it responds with HTTP 200.
 */
async function waitForService(url, label, timeout = SERVICE_POLL_TIMEOUT) {
  const deadline = Date.now() + timeout;
  log(`Waiting for ${label} (${url}) ...`);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        log(`${label} is ready.`);
        return;
      }
    } catch {
      // not ready yet
    }
    await sleep(SERVICE_POLL_INTERVAL);
  }
  throw new Error(`Timeout waiting for ${label} at ${url}`);
}

/**
 * Apply SES (Secure EcmaScript) workaround to prevent transit-js breakage.
 * Playwright's Chromium triggers SES lockdown in plugin iframes, which freezes
 * Object via the sandbox's allow-same-origin. This wraps Object.defineProperty
 * to swallow "not extensible" errors on frozen objects.
 */
async function applySesWorkaround(targetPage) {
  await targetPage.evaluate(() => {
    const origDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, desc) {
      try {
        return origDefineProperty.call(this, obj, prop, desc);
      } catch (e) {
        if (e instanceof TypeError && e.message.includes("not extensible")) {
          return obj;
        }
        throw e;
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // 1. Wait for services
  await waitForService(PENPOT_URI, "Penpot frontend");
  await waitForService(MANIFEST_URL, "MCP plugin manifest");

  // 2. Launch browser
  log("Launching browser (headless) ...");
  const browser = await chromium.launch({
    headless: HEADLESS,
    channel: "chromium-headless-shell",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);

  try {
    // 3. Login
    await login(page);

    // 4. Open workspace (file editor)
    await openWorkspace(page);

    // 5. Install & connect plugin
    await installAndConnectPlugin(page);

    // 6. Start bridge server (REST API proxy + file navigation)
    startBridgeServer(page);

    // 7. Keep alive — block until browser disconnects or Ctrl+C
    log("MCP connected. Browser will stay open. Press Ctrl+C to exit.");
    await keepAlive(browser, page);
  } catch (err) {
    console.error("Error:", err.message);
    // Save debug artifacts on failure
    const { writeFileSync } = await import("fs");
    await page.screenshot({ path: `${DEBUG_DIR}/mcp-connect-error.png` }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) writeFileSync(`${DEBUG_DIR}/mcp-connect-error.html`, html);
    log(`Debug saved: ${DEBUG_DIR}/mcp-connect-error.{png,html}`);
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 3: Login
// ---------------------------------------------------------------------------
async function login(page) {
  const deadline = Date.now() + LOGIN_RETRY_TIMEOUT;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    log(`Login attempt #${attempt} ...`);
    try {
      await page.goto(`${PENPOT_URI}/#/auth/login`, { waitUntil: "networkidle" });

      // Email field
      const emailInput = page.locator('input[type="email"], input[id="email"]');
      await emailInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
      await emailInput.fill(EMAIL);

      // Click "Continue" / "Login" to proceed to password step (or submit directly)
      const loginSubmit = page.locator('[data-testid="login-submit"], button[type="submit"]');
      await loginSubmit.first().click();

      // Password field (appears after Continue on some versions)
      const passwordInput = page.locator('input[type="password"], input[id="password"]');
      await passwordInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
      await passwordInput.fill(PASSWORD);

      // Submit login
      await loginSubmit.first().click();

      // Wait for navigation to dashboard or workspace (hash-based routing)
      await page.waitForURL((url) => {
        const hash = url.hash || "";
        return hash.includes("/dashboard") || hash.includes("/workspace") || hash.includes("/view");
      }, { timeout: NAV_TIMEOUT });

      log("Logged in successfully.");
      return;
    } catch (err) {
      log(`Login failed: ${err.message}`);
      if (Date.now() + LOGIN_RETRY_INTERVAL > deadline) {
        throw new Error(`Login failed after ${attempt} attempts: ${err.message}`);
      }
      await sleep(LOGIN_RETRY_INTERVAL);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: Open workspace (file editor)
// ---------------------------------------------------------------------------

/**
 * Use the browser session cookies to call Penpot REST API.
 */
async function apiCall(context, method, path, body) {
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const opts = {
    method,
    headers: { Cookie: cookieHeader, Accept: "application/json" },
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const url = path.startsWith("http") ? path : `${PENPOT_URI}${path}`;
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`API ${method} ${path} => ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) return null; // 空レスポンス対応（delete-file 等）
  return JSON.parse(text);
}

/**
 * Ensure MCP user has a workspace file via REST API.
 * Returns { projectId, fileId }.
 */
async function ensureWorkspaceFile(context) {
  log("Ensuring workspace file via REST API ...");

  // 1. Get shared team (prefer shared team, fall back to default)
  const teams = await apiCall(context, "GET", "/api/rpc/command/get-teams");
  const team =
    teams.find((t) => t.name === SHARED_TEAM_NAME) ||
    teams.find((t) => t.isDefault || t["is-default"]) ||
    teams[0];
  if (!team) throw new Error("No team found for MCP user");
  const teamId = team.id;
  log(`  Team: ${team.name} (${teamId})`);

  // 2. Get projects in team
  const projects = await apiCall(
    context,
    "GET",
    `/api/rpc/command/get-projects?team-id=${teamId}`
  );
  let project = projects.find((p) => p.isDefault || p["is-default"]) || projects[0];

  if (!project) {
    // Create project
    project = await apiCall(context, "POST", "/api/rpc/command/create-project", {
      teamId,
      name: "MCP Workspace",
    });
    log(`  Created project: ${project.id}`);
  }
  const projectId = project.id;
  log(`  Project: ${project.name} (${projectId})`);

  // 3. Get files in project
  const files = await apiCall(
    context,
    "GET",
    `/api/rpc/command/get-project-files?project-id=${projectId}`
  );

  // Prefer "MCP Workspace" file; skip shared library files
  let file = files.find((f) => f.name === "MCP Workspace")
    || files.find((f) => !f.isShared && !f["is-shared"])
    || files[0];
  if (!file) {
    // Create file
    file = await apiCall(context, "POST", "/api/rpc/command/create-file", {
      projectId,
      name: "MCP Workspace",
    });
    log(`  Created file: ${file.id}`);
  }
  log(`  File: ${file.name} (${file.id})`);

  return { projectId, fileId: file.id };
}

async function openWorkspace(page) {
  const { projectId, fileId } = await ensureWorkspaceFile(page.context());

  log(`Navigating to workspace: project=${projectId}, file=${fileId} ...`);
  await page.goto(`${PENPOT_URI}/#/workspace/${projectId}/${fileId}`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });

  // Ensure we're in the workspace editor
  await page.waitForSelector('[class*="viewport"]', {
    state: "visible",
    timeout: NAV_TIMEOUT,
  });
  log("Workspace is open.");
}

// ---------------------------------------------------------------------------
// Step 5–9: Install plugin & connect MCP
// ---------------------------------------------------------------------------
async function installAndConnectPlugin(page) {
  // 5. Open Plugin Manager with Ctrl+Alt+P
  log("Opening Plugin Manager ...");
  await page.keyboard.press("Control+Alt+KeyP");
  await sleep(1000);

  // Look for the plugin manager modal
  const pluginManagerModal = page.locator('[class*="plugin-management"]');
  await pluginManagerModal.waitFor({ state: "visible", timeout: PLUGIN_ACTION_TIMEOUT });
  log("Plugin Manager opened.");

  // 6. Check if MCP plugin is already installed
  const pluginList = pluginManagerModal.locator('[class*="plugins-list"], [class*="installed-plugins"]');
  const mcpEntry = pluginList.locator('text=MCP').first();
  const isInstalled = await mcpEntry.isVisible().catch(() => false);

  if (!isInstalled) {
    log("MCP plugin not found, installing ...");
    await installPlugin(page, pluginManagerModal);

    // Re-open Plugin Manager to refresh the installed plugins list
    log("Re-opening Plugin Manager to refresh list ...");
    await page.keyboard.press("Escape");
    await sleep(500);
    await page.keyboard.press("Control+Alt+KeyP");
    await sleep(1000);
    await pluginManagerModal.waitFor({ state: "visible", timeout: PLUGIN_ACTION_TIMEOUT });
  } else {
    log("MCP plugin already installed.");
  }

  // 7. Open the MCP plugin
  await openMcpPlugin(page, pluginManagerModal);

  // 8. Connect via iframe
  await connectMcpInIframe(page);

  // 9. Verify connection
  await verifyConnection(page);
}

async function installPlugin(page, modal) {
  // Find the URL input field in the plugin manager
  const urlInput = modal.locator(
    'input[placeholder*="URL"], input[placeholder*="url"], input[type="url"], input[type="text"]'
  ).first();
  await urlInput.waitFor({ state: "visible", timeout: PLUGIN_ACTION_TIMEOUT });
  await urlInput.fill(MANIFEST_URL);

  // Click Install button
  const installBtn = modal.locator('button:has-text("Install"), [class*="install-button"]').first();
  await installBtn.click();
  log("Install clicked, waiting for permission dialog ...");

  // Handle "Allow" permission dialog (button text may be uppercased via CSS)
  await sleep(2000);
  const allowBtn = page.getByRole('button', { name: /allow/i });
  const allowVisible = await allowBtn.isVisible().catch(() => false);
  if (allowVisible) {
    await allowBtn.click();
    log("Permission allowed.");
    await sleep(1000);
  } else {
    log("Warning: No Allow dialog found. Saving debug snapshot ...");
    const { writeFileSync } = await import("fs");
    await page.screenshot({ path: `${DEBUG_DIR}/mcp-install-debug.png` }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) writeFileSync(`${DEBUG_DIR}/mcp-install-debug.html`, html);
  }

  await sleep(1000);
  log("Plugin installed.");
}

async function openMcpPlugin(page, modal) {
  log("Opening MCP plugin ...");

  // Apply SES workaround before opening the plugin
  await applySesWorkaround(page);

  // Find the Open/Launch button for the MCP plugin in the plugin list
  // Strategy 1: Look for an "Open" button near MCP text within the modal
  const openBtn = modal.locator(
    '[class*="plugin-entry"]:has-text("MCP") button:has-text("Open"), ' +
    '[class*="plugin-item"]:has-text("MCP") button:has-text("Open"), ' +
    '[class*="plugins-list-element"]:has-text("MCP") button:has-text("Open")'
  ).first();

  const openVisible = await openBtn.isVisible().catch(() => false);
  if (openVisible) {
    await openBtn.click();
    log("Clicked Open on MCP plugin entry.");
  } else {
    // Strategy 2: Just click the first "Open" button in the modal
    const anyOpen = modal.locator('button:has-text("Open")').first();
    const anyOpenVisible = await anyOpen.isVisible().catch(() => false);
    if (anyOpenVisible) {
      await anyOpen.click();
      log("Clicked first Open button in plugin manager.");
    } else {
      // Strategy 3: Close modal and try launching from plugin menu
      log("No Open button found, trying to close modal and use plugin menu ...");
      await page.keyboard.press("Escape");
      await sleep(500);
      // Re-open plugin manager and try again
      await page.keyboard.press("Control+Alt+KeyP");
      await sleep(1000);
      const retryOpen = page.locator('button:has-text("Open")').first();
      await retryOpen.waitFor({ state: "visible", timeout: PLUGIN_ACTION_TIMEOUT });
      await retryOpen.click();
      log("Clicked Open on retry.");
    }
  }

  // Open クリックで Plugin Manager は自動的に閉じる
  // プラグインパネル（iframe）の読み込みを待つ
  await sleep(3000);
}

async function connectMcpInIframe(page) {
  log("Looking for MCP plugin iframe ...");
  const deadline = Date.now() + PLUGIN_ACTION_TIMEOUT;

  while (Date.now() < deadline) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        // data-handler 属性 または テキストベースで Connect ボタンを探す
        const btn = frame.locator(
          'button[data-handler="connect-mcp"], button:has-text("CONNECT"), button:has-text("Connect")'
        ).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          log("Found Connect button in frame: " + frame.url());
          await btn.click();
          log("Clicked Connect in MCP plugin iframe.");
          return;
        }
      } catch { /* frame not ready */ }
    }
    await sleep(1000);
  }
  // デバッグ: 全フレームのURLを出力
  for (const frame of page.frames()) {
    log(`  frame: ${frame.url()}`);
  }
  throw new Error("Could not find MCP Connect button in any frame");
}

async function verifyConnection(page) {
  log("Verifying MCP connection ...");
  const deadline = Date.now() + PLUGIN_ACTION_TIMEOUT;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const statusEl = frame.locator("#connection-status");
        const text = await statusEl.textContent({ timeout: 1000 });
        if (text && text.toLowerCase().includes("connected")) {
          log("MCP connection verified: " + text.trim());
          return;
        }
      } catch { /* not ready */ }
    }
    await sleep(1000);
  }

  log("Warning: Could not verify connection status, but connection may be active.");
}

// ---------------------------------------------------------------------------
// HTTP Bridge Server (REST API proxy + file navigation for execute_code)
// ---------------------------------------------------------------------------
let navigationStatus = "ready";
let lastReconnectTime = 0;

/**
 * Check if the MCP plugin is connected by inspecting the iframe status element.
 */
async function checkPluginConnected(page) {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const statusEl = frame.locator("#connection-status");
      const text = await statusEl.textContent({ timeout: 2000 });
      if (text && text.toLowerCase().includes("connected")) return true;
    } catch { /* frame not available */ }
  }
  return false;
}

/**
 * Periodically check plugin connection and auto-reconnect if disconnected.
 */
function startConnectionMonitor(page) {
  setInterval(async () => {
    if (navigationStatus !== "ready") return;
    if (Date.now() - lastReconnectTime < RECONNECT_COOLDOWN) return;

    try {
      const connected = await checkPluginConnected(page);
      if (!connected) {
        log("[monitor] Plugin disconnected. Auto-reconnecting ...");
        lastReconnectTime = Date.now();
        await reconnectPlugin(page);
        // If reconnect failed (status="error"), reset to "ready" so monitor can retry
        if (navigationStatus === "error") {
          navigationStatus = "ready";
          log("[monitor] Will retry on next interval.");
        }
      }
    } catch (e) {
      log(`[monitor] Check error: ${e.message}`);
    }
  }, MONITOR_INTERVAL);
}

/**
 * Reconnect the MCP plugin after navigating to a different file.
 * Reuses existing openMcpPlugin / connectMcpInIframe / verifyConnection.
 */
async function reconnectPlugin(page) {
  navigationStatus = "reconnecting";
  log("[nav] Reconnecting MCP plugin ...");
  try {
    const pluginManagerModal = page.locator('[class*="plugin-management"]');
    let managerOpened = false;

    // Strategy 1: Try keyboard shortcut (fast path)
    await page.keyboard.press("Escape");
    await sleep(500);
    const viewport = page.locator('[class*="viewport"]').first();
    await viewport.click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(300);

    await page.keyboard.press("Control+Alt+KeyP");
    managerOpened = await pluginManagerModal.waitFor({ state: "visible", timeout: 5000 })
      .then(() => true).catch(() => false);

    // Strategy 2: Reload page to get clean state (reliable fallback)
    if (!managerOpened) {
      log("[nav] Shortcut failed, reloading page ...");
      await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.waitForSelector('[class*="viewport"]', {
        state: "visible",
        timeout: NAV_TIMEOUT,
      });
      await sleep(1000);

      await page.keyboard.press("Control+Alt+KeyP");
      await sleep(1000);
      await pluginManagerModal.waitFor({ state: "visible", timeout: PLUGIN_ACTION_TIMEOUT });
    }

    // Open the MCP plugin (applies SES workaround + clicks Open)
    await openMcpPlugin(page, pluginManagerModal);

    // Connect in iframe
    await connectMcpInIframe(page);

    // Verify
    await verifyConnection(page);

    navigationStatus = "ready";
    log("[nav] MCP reconnected successfully.");
  } catch (err) {
    navigationStatus = "error";
    log(`[nav] Reconnect failed: ${err.message}`);
  }
}

/**
 * Start the bridge HTTP server on port 3000.
 *
 * This server bridges the plugin iframe (execute_code context) with the
 * browser session managed by Playwright, providing:
 *   - REST API proxy with browser cookie authentication
 *   - File navigation (Playwright-driven) with automatic plugin reconnection
 *
 * Endpoints:
 *   POST /api-proxy   { command, params }     → Proxy POST to Penpot REST API (browser cookie auth)
 *   GET  /api-proxy?command=...&key=val       → Proxy GET to Penpot REST API (browser cookie auth)
 *   POST /navigate    { projectId, fileId }   → Playwright navigation + plugin reconnect
 *   GET  /status      → { status: 'ready' | 'navigating' | 'reconnecting' | 'error' }
 */
function startBridgeServer(page) {
  const server = http.createServer(async (req, res) => {
    // CORS headers (requests come from plugin iframe origin)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /status
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: navigationStatus }));
      return;
    }

    // POST /api-proxy — Proxy REST API calls using browser session cookies
    if (req.method === "POST" && req.url === "/api-proxy") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { command, params = {} } = JSON.parse(body);
          if (!command) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "command is required" }));
            return;
          }
          try {
            const result = await apiCall(page.context(), "POST", `/api/rpc/command/${command}`, params);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            log(`[api-proxy] ${command} failed: ${err.message}`);
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      });
      return;
    }

    // GET /api-proxy?command=...&param1=...&param2=... — GET variant for read-only API calls
    if (req.method === "GET" && req.url.startsWith("/api-proxy?")) {
      try {
        const url = new URL(req.url, "http://localhost");
        const command = url.searchParams.get("command");
        if (!command) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "command query parameter is required" }));
          return;
        }
        // Build params from remaining query parameters
        const params = {};
        for (const [key, value] of url.searchParams) {
          if (key !== "command") params[key] = value;
        }
        try {
          const result = await apiCall(page.context(), "GET", `/api/rpc/command/${command}?${url.searchParams.toString()}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          log(`[api-proxy GET] ${command} failed: ${err.message}`);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid query parameters" }));
      }
      return;
    }

    // POST /navigate
    if (req.method === "POST" && req.url === "/navigate") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { projectId, fileId } = JSON.parse(body);
          if (!projectId || !fileId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "projectId and fileId are required" }));
            return;
          }

          // Return immediately so execute_code context is preserved
          navigationStatus = "navigating";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "navigating", projectId, fileId }));

          // Background: navigate + reconnect
          try {
            log(`[nav] Navigating to project=${projectId}, file=${fileId} ...`);
            await page.goto(`${PENPOT_URI}/#/workspace/${projectId}/${fileId}`, {
              waitUntil: "domcontentloaded",
              timeout: NAV_TIMEOUT,
            });
            await page.waitForSelector('[class*="viewport"]', {
              state: "visible",
              timeout: NAV_TIMEOUT,
            });
            log("[nav] Workspace loaded. Reconnecting plugin ...");
            await reconnectPlugin(page);
          } catch (err) {
            navigationStatus = "error";
            log(`[nav] Navigation failed: ${err.message}`);
          }
        } catch (err) {
          // JSON parse error — response may already be sent
          if (!res.writableEnded) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON body" }));
          }
        }
      });
      return;
    }

    // Fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(3000, "0.0.0.0", () => {
    log("Bridge server listening on http://0.0.0.0:3000");
  });

  return server;
}

// ---------------------------------------------------------------------------
// Step 10: Keep alive
// ---------------------------------------------------------------------------
async function keepAlive(browser, page) {
  startConnectionMonitor(page);
  return new Promise((resolve) => {
    // Exit with error on unexpected disconnect so container restarts
    browser.on("disconnected", () => {
      log("Browser disconnected unexpectedly. Exiting for restart ...");
      process.exit(1);
    });

    // Handle Ctrl+C / SIGTERM gracefully (normal shutdown)
    const shutdown = async () => {
      log("Shutting down ...");
      await browser.close().catch(() => {});
      resolve();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
