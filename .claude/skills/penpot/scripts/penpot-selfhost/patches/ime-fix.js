/**
 * IME Composition Fix for Penpot Comment Input
 * https://github.com/penpot/penpot — affects v2.13.x
 *
 * Problem:
 *   When IME is active (Japanese / Chinese / Korean input), pressing
 *   Enter to confirm the composition duplicates the text because the
 *   keydown handler treats it as a newline insertion.
 *
 * Fix:
 *   Intercept keydown events on contentEditable comment inputs and
 *   suppress Enter when event.isComposing is true or immediately
 *   after a compositionend event (browser-dependent timing).
 *
 * Removal:
 *   Set PENPOT_PATCH_IME_FIX=false in .env and restart.
 *   When upstream fixes the issue, remove entire patches/ directory
 *   and related entries in docker-compose.yml / .env.
 */
(function () {
  "use strict";

  // compositionend fires before the final keydown in some browsers.
  // Track a short cooldown to catch the trailing Enter keydown.
  let compositionJustEnded = false;
  let compositionTimer = null;

  document.addEventListener(
    "compositionend",
    function () {
      compositionJustEnded = true;
      clearTimeout(compositionTimer);
      compositionTimer = setTimeout(function () {
        compositionJustEnded = false;
      }, 300);
    },
    true,
  );

  document.addEventListener(
    "compositionstart",
    function () {
      compositionJustEnded = false;
      clearTimeout(compositionTimer);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Enter") return;

      var target = event.target;
      if (!target || !target.getAttribute) return;
      if (target.getAttribute("contenteditable") !== "true") return;

      // Helper: safely get class string (SVG elements return SVGAnimatedString)
      function getClassName(el) {
        if (!el) return "";
        var cn = el.className;
        if (typeof cn === "string") return cn;
        if (cn && typeof cn.baseVal === "string") return cn.baseVal;
        return el.getAttribute("class") || "";
      }

      // Match Penpot comment input (CSS-modules class contains "comment-input")
      var cls = getClassName(target);
      var isCommentInput =
        cls.indexOf("comment-input") !== -1 ||
        cls.indexOf("comment_input") !== -1;

      if (!isCommentInput) {
        var parent = target.parentElement;
        for (var i = 0; i < 5 && parent; i++) {
          var pc = getClassName(parent);
          if (
            pc.indexOf("comment") !== -1 &&
            (pc.indexOf("form") !== -1 ||
              pc.indexOf("thread") !== -1 ||
              pc.indexOf("input") !== -1)
          ) {
            isCommentInput = true;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!isCommentInput) return;

      if (event.isComposing || compositionJustEnded) {
        event.stopImmediatePropagation();
        return;
      }
    },
    true,
  );
})();
