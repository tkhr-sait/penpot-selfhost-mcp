/**
 * Playwright test for ime-fix.js patch
 *
 * Validates that the composing-state tracking patch correctly suppresses
 * keydown events on editable elements during IME composition, and allows
 * them through otherwise.
 *
 * Usage:
 *   cd penpot-selfhost
 *   npx playwright test --config patches/playwright.config.mjs
 *
 * Report:
 *   npx playwright show-report /tmp/ime-test-report
 *
 * Prereq:
 *   - Penpot running via penpot-manage.sh
 *   - cd mcp-connect && npm install
 *   - npx playwright install chromium firefox webkit
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = process.env.PENPOT_URL || "http://localhost:9001";
const EMAIL = process.env.PENPOT_DEFAULT_EMAIL || "dev@example.com";
const PASSWORD = process.env.PENPOT_DEFAULT_PASSWORD || "devdev123";

const NAV_TIMEOUT = 30_000;
const LOGIN_RETRY_INTERVAL = 5_000;
const LOGIN_RETRY_TIMEOUT = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(browser, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${browser}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Login (adapted from mcp-connect.mjs)
// ---------------------------------------------------------------------------
async function login(page, browserName) {
  const deadline = Date.now() + LOGIN_RETRY_TIMEOUT;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    log(browserName, `Login attempt #${attempt} ...`);
    try {
      await page.goto(`${BASE_URL}/#/auth/login`, {
        waitUntil: "networkidle",
      });

      const emailInput = page.locator(
        'input[type="email"], input[id="email"]'
      );
      await emailInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
      await emailInput.fill(EMAIL);

      const loginSubmit = page.locator(
        '[data-testid="login-submit"], button[type="submit"]'
      );
      await loginSubmit.first().click();

      const passwordInput = page.locator(
        'input[type="password"], input[id="password"]'
      );
      await passwordInput.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
      await passwordInput.fill(PASSWORD);

      await loginSubmit.first().click();

      await page.waitForURL(
        (url) => {
          const hash = url.hash || "";
          return (
            hash.includes("/dashboard") ||
            hash.includes("/workspace") ||
            hash.includes("/view")
          );
        },
        { timeout: NAV_TIMEOUT }
      );

      log(browserName, "Logged in.");
      return;
    } catch (err) {
      log(browserName, `Login failed: ${err.message}`);
      if (Date.now() + LOGIN_RETRY_INTERVAL > deadline) {
        throw new Error(
          `Login failed after ${attempt} attempts: ${err.message}`
        );
      }
      await sleep(LOGIN_RETRY_INTERVAL);
    }
  }
}

// ---------------------------------------------------------------------------
// Navigate to workspace (open any file)
// ---------------------------------------------------------------------------
async function openWorkspaceFile(page, context, browserName) {
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  async function api(method, path, body) {
    const opts = {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
    return res.json();
  }

  const teams = await api("GET", "/api/rpc/command/get-teams");
  const defaultTeam = teams.find((t) => t.isDefault) || teams[0];
  const projects = await api(
    "GET",
    `/api/rpc/command/get-projects?team-id=${defaultTeam.id}`
  );
  const project = projects[0];
  if (!project) throw new Error("No project found");

  const files = await api(
    "GET",
    `/api/rpc/command/get-project-files?project-id=${project.id}`
  );

  let fileId;
  if (files.length > 0) {
    fileId = files[0].id;
  } else {
    const newFile = await api("POST", "/api/rpc/command/create-file", {
      projectId: project.id,
      name: "IME Test",
    });
    fileId = newFile.id;
  }

  await page.goto(`${BASE_URL}/#/workspace/${project.id}/${fileId}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);
  log(browserName, `Opened workspace file ${fileId}`);
}

// ---------------------------------------------------------------------------
// Verify the IME patch script is loaded
// ---------------------------------------------------------------------------
async function verifyPatchLoaded(page, browserName) {
  const loaded = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script"));
    return scripts.some((s) => s.src && s.src.includes("ime-fix"));
  });
  if (!loaded) {
    log(browserName, "WARNING: ime-fix.js script tag not found in page.");
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

/**
 * Verification strategy:
 *
 * The ime-fix.js patch registers capture-phase listeners on `document`.
 * When it calls stopImmediatePropagation() during capture, the event
 * stops propagating entirely — it never reaches the target element.
 * We register a bubble-phase listener on the target; if it fires, the
 * event was NOT blocked. If it doesn't fire, the patch suppressed it.
 */

test.describe("IME Fix Patch", () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    page.setDefaultTimeout(NAV_TIMEOUT);
    await login(page, browserName);
    await openWorkspaceFile(page, context, browserName);
    await verifyPatchLoaded(page, browserName);
  });

  test("IME active: Enter on contenteditable is blocked", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("div");
      el.contentEditable = "true";
      el.textContent = "test";
      document.body.appendChild(el);
      try {
        let reached = false;
        el.addEventListener("keydown", () => {
          reached = true;
        });

        el.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true })
        );
        const kev = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(kev);
        el.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true })
        );

        return {
          blocked: !reached,
          detail: reached
            ? "listener reached (NOT blocked)"
            : "listener NOT reached (blocked)",
        };
      } finally {
        el.remove();
      }
    });

    console.log(`  Detail: ${result.detail}`);
    expect(result.blocked).toBe(true);
  });

  test("No IME: Enter on contenteditable propagates", async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("div");
      el.contentEditable = "true";
      el.textContent = "test";
      document.body.appendChild(el);
      try {
        let reached = false;
        el.addEventListener("keydown", () => {
          reached = true;
        });

        const kev = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(kev);

        return {
          blocked: !reached,
          detail: reached
            ? "listener reached (propagated)"
            : "listener NOT reached (blocked)",
        };
      } finally {
        el.remove();
      }
    });

    console.log(`  Detail: ${result.detail}`);
    expect(result.blocked).toBe(false);
  });

  test("IME active: Enter on non-editable div propagates", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("div");
      el.textContent = "plain div";
      document.body.appendChild(el);
      try {
        let reached = false;
        el.addEventListener("keydown", () => {
          reached = true;
        });

        el.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true })
        );
        const kev = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(kev);
        el.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true })
        );

        return {
          blocked: !reached,
          detail: reached
            ? "listener reached (propagated)"
            : "listener NOT reached (blocked)",
        };
      } finally {
        el.remove();
      }
    });

    console.log(`  Detail: ${result.detail}`);
    expect(result.blocked).toBe(false);
  });

  test("IME active: Enter on <input> is blocked", async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("input");
      el.type = "text";
      document.body.appendChild(el);
      try {
        let reached = false;
        el.addEventListener("keydown", () => {
          reached = true;
        });

        el.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true })
        );
        const kev = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(kev);
        el.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true })
        );

        return {
          blocked: !reached,
          detail: reached
            ? "listener reached (NOT blocked)"
            : "listener NOT reached (blocked)",
        };
      } finally {
        el.remove();
      }
    });

    console.log(`  Detail: ${result.detail}`);
    expect(result.blocked).toBe(true);
  });

  test("IME active: Enter on <textarea> is blocked", async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("textarea");
      document.body.appendChild(el);
      try {
        let reached = false;
        el.addEventListener("keydown", () => {
          reached = true;
        });

        el.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true })
        );
        const kev = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(kev);
        el.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true })
        );

        return {
          blocked: !reached,
          detail: reached
            ? "listener reached (NOT blocked)"
            : "listener NOT reached (blocked)",
        };
      } finally {
        el.remove();
      }
    });

    console.log(`  Detail: ${result.detail}`);
    expect(result.blocked).toBe(true);
  });
});
