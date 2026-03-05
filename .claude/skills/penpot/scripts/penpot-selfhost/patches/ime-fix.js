/**
 * IME Composition Fix for Penpot
 * https://github.com/penpot/penpot — affects v2.13.x
 *
 * Problem:
 *   When IME is active (Japanese / Chinese / Korean input), pressing
 *   Enter to confirm the composition duplicates the text because the
 *   keydown handler treats it as a newline insertion.
 *
 * Fix:
 *   Track composing state via compositionstart/compositionend events.
 *   Suppress keydown on editable elements while composing.
 *   Same pattern as the upstream fix (composing* state in ClojureScript).
 *
 * Removal:
 *   Set PENPOT_PATCH_IME_FIX=false in .env and restart.
 */
(function () {
  "use strict";

  var composing = false;

  document.addEventListener("compositionstart", function () {
    composing = true;
  }, true);

  document.addEventListener("compositionend", function () {
    composing = false;
  }, true);

  document.addEventListener("keydown", function (event) {
    if (!composing) return;
    var t = event.target;
    if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
      event.stopImmediatePropagation();
    }
  }, true);
})();
