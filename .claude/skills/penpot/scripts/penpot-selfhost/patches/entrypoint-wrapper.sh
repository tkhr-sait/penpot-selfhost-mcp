#!/bin/sh
# Penpot frontend entrypoint wrapper
# Applies optional patches before starting nginx.
#
# Patches are volume-mounted into /opt/patches/ and injected into
# index.html at container start. To disable, set the corresponding
# env var to "false".

set -eu

INDEX_HTML="/var/www/app/index.html"

# --- IME Fix Patch ---
# Env: PENPOT_PATCH_IME_FIX (default: true)
if [ "${PENPOT_PATCH_IME_FIX:-true}" = "true" ]; then
  PATCH_SRC="/opt/patches/ime-fix.js"
  PATCH_DST="/var/www/app/js/ime-fix.js"
  if [ -f "$PATCH_SRC" ]; then
    cp "$PATCH_SRC" "$PATCH_DST"
    if ! grep -q 'ime-fix.js' "$INDEX_HTML" 2>/dev/null; then
      sed -i 's|</body>|<script src="/js/ime-fix.js"></script></body>|' "$INDEX_HTML"
    fi
    echo "[patch] IME fix applied."
  else
    echo "[patch] WARNING: ime-fix.js not found at $PATCH_SRC, skipping."
  fi
else
  echo "[patch] IME fix disabled (PENPOT_PATCH_IME_FIX=false)."
fi

# Hand off to the original entrypoint + CMD
exec /bin/bash /entrypoint.sh "$@"
