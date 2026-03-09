/**
 * Playwright test for IME fix patch
 *
 * Validates that the IME composition fix (source patch or runtime patch)
 * correctly suppresses app-level key handling during IME composition
 * on real Penpot components (comment input).
 *
 * Tests 1–2: Synthetic element sanity checks (all browsers)
 * Tests 3–5: Real Penpot comment input with CDP IME (Chromium only)
 *
 * Usage:
 *   cd patches/test
 *   npx playwright test --config playwright.config.mjs
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
// Verify the IME patch script is loaded (runtime patch only)
// ---------------------------------------------------------------------------
async function verifyPatchLoaded(page, browserName) {
  const loaded = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script"));
    return scripts.some((s) => s.src && s.src.includes("ime-fix"));
  });
  if (loaded) {
    log(browserName, "Runtime patch (ime-fix.js) detected.");
  } else {
    log(
      browserName,
      "Runtime patch not found — assuming source patch (build) mode."
    );
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Open comment draft on canvas
// ---------------------------------------------------------------------------
async function openCommentDraft(page, browserName) {
  // Switch to comment mode with 'C' shortcut
  await page.keyboard.press("c");
  await page.waitForTimeout(500);
  log(browserName, "Switched to comment mode.");

  // Click on the viewport-controls SVG to create a comment draft
  const vpControls = page.locator("svg.viewport-controls");
  await vpControls.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
  await vpControls.click({ position: { x: 300, y: 300 } });
  log(browserName, "Clicked canvas to create comment draft.");

  // Wait for the comment input to appear
  const commentInput = page.locator(
    '[contenteditable="true"][role="textbox"]'
  );
  await commentInput.waitFor({ state: "visible", timeout: 10_000 });
  await commentInput.click();
  await page.waitForTimeout(300);
  log(browserName, "Comment input is visible and focused.");

  return commentInput;
}

// ---------------------------------------------------------------------------
// CDP IME helpers (Chromium only)
// ---------------------------------------------------------------------------

/** Start IME composition via CDP Input.imeSetComposition */
async function cdpStartComposition(cdp, text) {
  await cdp.send("Input.imeSetComposition", {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
}

/** Commit IME composition via CDP: clear composition then insertText */
async function cdpCommitComposition(cdp, text) {
  await cdp.send("Input.imeSetComposition", {
    text: "",
    selectionStart: 0,
    selectionEnd: 0,
  });
  await cdp.send("Input.insertText", { text });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

/**
 * Verification strategy:
 *
 * Tests 1–2 use synthetic DOM elements for basic sanity checks that
 * work on all browsers.
 *
 * Tests 3–5 use CDP Input.imeSetComposition (Chromium only) to trigger
 * real browser-level IME composition on Penpot's comment input. This
 * verifies the patch suppresses app-level key handling during composition:
 *
 *   - During composition: Escape does NOT close the comment draft
 *   - Without composition: Escape closes the draft normally
 *   - After composition ends: Escape closes the draft normally
 */

test.describe("IME Fix Patch", () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    page.setDefaultTimeout(NAV_TIMEOUT);
    await login(page, browserName);
    await openWorkspaceFile(page, context, browserName);
    await verifyPatchLoaded(page, browserName);
  });

  // -----------------------------------------------------------------------
  // Synthetic element tests (all browsers)
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Real Penpot comment input tests with CDP IME (Chromium only)
  // -----------------------------------------------------------------------

  test("Comment input: Escape during IME composition keeps draft open", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "CDP IME simulation only available on Chromium"
    );

    const commentInput = await openCommentDraft(page, browserName);
    const cdp = await page.context().newCDPSession(page);

    // Type some text
    await commentInput.pressSequentially("hello");
    await page.waitForTimeout(200);

    // Start real IME composition via CDP
    await cdpStartComposition(cdp, "あ");
    await page.waitForTimeout(300);
    log(browserName, "CDP: compositionstart fired.");

    // Press Escape during IME composition — patch should suppress it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Verify: comment draft is still open
    const isVisible = await commentInput.isVisible();
    log(browserName, `Draft visible after Escape during IME: ${isVisible}`);
    expect(isVisible).toBe(true);

    // Verify: text is preserved
    const text = await commentInput.innerText();
    expect(text).toContain("hello");

    // Cleanup: commit composition
    await cdpCommitComposition(cdp, "あ");
  });

  test("Comment input: Escape without IME closes draft", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "CDP IME simulation only available on Chromium"
    );

    const commentInput = await openCommentDraft(page, browserName);

    // Type some text
    await commentInput.pressSequentially("hello");
    await page.waitForTimeout(200);

    // Press Escape without IME — should close the draft
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Verify: comment draft is closed
    const isVisible = await commentInput.isVisible().catch(() => false);
    log(browserName, `Draft visible after Escape (no IME): ${isVisible}`);
    expect(isVisible).toBe(false);
  });

  test("Comment input: after IME composition ends, Escape closes draft", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "CDP IME simulation only available on Chromium"
    );

    const commentInput = await openCommentDraft(page, browserName);
    const cdp = await page.context().newCDPSession(page);

    // Type some text
    await commentInput.pressSequentially("test");
    await page.waitForTimeout(200);

    // Start and commit IME composition
    await cdpStartComposition(cdp, "い");
    await page.waitForTimeout(300);
    log(browserName, "CDP: compositionstart fired.");

    await cdpCommitComposition(cdp, "い");
    await page.waitForTimeout(500);
    log(browserName, "CDP: composition committed.");

    // Verify text includes both typed and composed text
    const text = await commentInput.innerText();
    log(browserName, `Text after composition: "${text}"`);
    expect(text).toContain("test");
    expect(text).toContain("い");

    // Press Escape after composition ended — should close the draft
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const isVisible = await commentInput.isVisible().catch(() => false);
    log(browserName, `Draft visible after post-IME Escape: ${isVisible}`);
    expect(isVisible).toBe(false);
  });
});
