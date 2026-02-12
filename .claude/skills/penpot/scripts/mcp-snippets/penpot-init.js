// ============================================================
// Penpot Design Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.getToken, storage.tokenFill, storage.tokenStroke,
//           storage.spacing, storage.createText,
//           storage.createAndOpenPage, storage.assertCurrentPage,
//           storage.getFileComments
// ============================================================
// NOTE: tokenFill/tokenStroke はトークン未定義時に null を返す。
//       その場合はリテラル値（例: { fillColor: '#333333', fillOpacity: 1 }）でフォールバックすること。

// セマンティックカラートークン取得
storage.getToken = (name) => penpot.library.local.colors.find(c => c.name === name);

storage.tokenFill = (name) => {
  const token = storage.getToken(name);
  return token ? token.asFill() : null;
};

storage.tokenStroke = (name) => {
  const token = storage.getToken(name);
  return token ? token.asStroke() : null;
};

// スペーシング定数
storage.spacing = {
  xs: 4, sm: 8, md: 12, base: 16,
  lg: 24, xl: 32, '2xl': 48, '3xl': 64
};

// テキスト作成ヘルパー（fontFamily: sourcesanspro 強制）
storage.createText = (chars, { fontSize = 16, fontWeight = 'regular', growType = 'auto-width' } = {}) => {
  const text = penpot.createText(chars);
  text.fontFamily = 'sourcesanspro';
  text.fontSize = fontSize;
  text.fontWeight = fontWeight;
  text.growType = growType;
  return text;
};

// ページ作成 + 切替ヘルパー（ページ作成後の切替忘れ防止）
// 新規ページを作成し、そのページに自動的に切り替える。
// 戻り値: 作成された Page オブジェクト
storage.createAndOpenPage = async (name) => {
  const page = penpot.createPage();
  page.name = name;
  penpot.openPage(page, false);
  await new Promise(r => setTimeout(r, 200));
  // 切替確認: currentPage が新ページになっていなければエラー
  if (penpot.currentPage.id !== page.id) {
    throw new Error(
      `[createAndOpenPage] ページ切替に失敗しました。` +
      ` 期待: "${name}" (${page.id}), 実際: "${penpot.currentPage.name}" (${penpot.currentPage.id})`
    );
  }
  return page;
};

// 現在のページを検証するガード関数
// 意図したページで作業しているか確認し、違う場合はエラーを投げる
storage.assertCurrentPage = (expectedPageOrId) => {
  const currentId = penpot.currentPage.id;
  const expectedId = typeof expectedPageOrId === 'string'
    ? expectedPageOrId
    : expectedPageOrId.id;
  if (currentId !== expectedId) {
    const expectedName = typeof expectedPageOrId === 'string'
      ? expectedPageOrId
      : expectedPageOrId.name;
    throw new Error(
      `[assertCurrentPage] 現在のページが期待と異なります。` +
      ` 期待: "${expectedName}" (${expectedId}), 実際: "${penpot.currentPage.name}" (${currentId})。` +
      ` penpot.openPage(page, false) を実行してください。`
    );
  }
  return true;
};

// ファイル全体の未解決コメント取得（ページ横断）
storage.getFileComments = async () => {
  const currentPage = penpot.currentPage;
  const pages = penpotUtils.getPages();
  const results = [];
  for (const p of pages) {
    const page = penpotUtils.getPageById(p.id);
    penpot.openPage(page, false);
    await new Promise(r => setTimeout(r, 100));
    const threads = await penpot.currentPage.findCommentThreads({
      onlyActive: true, showResolved: false
    });
    if (threads.length > 0) {
      const threadData = [];
      for (const t of threads) {
        const comments = await t.findComments();
        threadData.push({
          seqNumber: t.seqNumber,
          content: comments[0]?.content,
          user: comments[0]?.user?.name,
          date: comments[0]?.date,
          commentCount: comments.length
        });
      }
      results.push({ page: p.name, threads: threadData });
    }
  }
  penpot.openPage(currentPage, false);
  return results;
};
