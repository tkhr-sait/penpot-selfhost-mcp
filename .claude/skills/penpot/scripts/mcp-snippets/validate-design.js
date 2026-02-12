// ============================================================
// Penpot Design Validator (self-hosted environment)
// Read this file, then run via MCP execute_code.
//
// SELF-HOSTED CONSTRAINT:
//   fontFamily MUST be "sourcesanspro" — the only built-in font.
//   Google Fonts are not loaded (air-gapped). Wrong font → 0x0 size.
//
// For general Plugin API constraints (insertChild, growType, Flex order, etc.)
// see the MCP high_level_overview (always in system prompt when connected).
// ============================================================

const root = (typeof board !== 'undefined' && board) ? board : penpot.root;
const issues = [];

// ページ検証: 期待ページが指定されていれば、現在のページと一致するか確認
if (typeof expectedPageId !== 'undefined' && expectedPageId) {
  if (penpot.currentPage.id !== expectedPageId)
    issues.push(`[ERROR] ページ不一致: 期待="${expectedPageId}", 実際="${penpot.currentPage.name}" (${penpot.currentPage.id})`);
}

for (const t of penpotUtils.findShapes(s => s.type === 'text', root)) {
  if (t.fontFamily !== 'sourcesanspro')
    issues.push(`[ERROR] ${t.name}: fontFamily="${t.fontFamily}" → must be "sourcesanspro"`);
  if (t.width === 0 || t.height === 0)
    issues.push(`[ERROR] ${t.name}: size=${t.width}x${t.height} (font not loaded?)`);
  if (t.growType === 'fixed')
    issues.push(`[WARN] ${t.name}: growType="fixed" (overflow risk)`);
}

return issues.length ? issues : 'All checks passed.';
