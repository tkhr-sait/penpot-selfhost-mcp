// ============================================================
// Penpot Design Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.spacing, storage.createText,
//           storage.createAndOpenPage, storage.assertCurrentPage,
//           storage.getFileComments, storage.connectLibrary
// ============================================================

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
// 空の "Page 1" が存在する場合はリネームして再利用する（Penpot はファイル作成時に
// Page 1 を自動生成するため、新規ページ作成前に空き Page 1 を優先利用する）。
// ファイルには最低1ページが必要なため、Page 1 の再利用はページ数の肥大化も防ぐ。
// 戻り値: 作成または再利用された Page オブジェクト
storage.createAndOpenPage = async (name) => {
  let page;
  // 空の Page 1 を探して再利用
  const pages = penpotUtils.getPages();
  const page1 = pages.find(p => p.name === 'Page 1');
  if (page1) {
    const p1 = penpotUtils.getPageById(page1.id);
    if (p1 && p1.root.children.length === 0) {
      p1.name = name;
      page = p1;
    }
  }
  // 再利用できなければ新規作成
  if (!page) {
    page = penpot.createPage();
    page.name = name;
  }
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

// ライブラリ接続ヘルパー（connectLibrary の返り値キャッシュ問題を回避）
// penpot.library.connectLibrary() の返り値は name: null, components: [] になることがある。
// 接続後に penpot.library.connected から取得し直すことで正しい値を返す。
storage.connectLibrary = async (libraryId) => {
  await penpot.library.connectLibrary(libraryId);
  const lib = penpot.library.connected.find(l => l.id === libraryId);
  if (!lib) {
    throw new Error(`[connectLibrary] 接続後にライブラリが見つかりません: ${libraryId}`);
  }
  return lib;
};
