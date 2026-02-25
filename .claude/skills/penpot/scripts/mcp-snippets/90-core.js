// ============================================================
// Penpot Core Utilities (init.d: 90 — 最後に実行)
//
// activate 時に自動実行。冪等（再呼び出しでも安全）。
// 基本ヘルパー + validateDesign + context/metrics + return。
//
// Provides: storage.spacing, storage.createText, storage.appendChild,
//           storage.createAndOpenPage, storage.assertCurrentPage,
//           storage.getFileComments, storage.connectLibrary,
//           storage.getPageContext, storage.toggleSetPersistent,
//           storage.switchThemePersistent, storage.validateDesign
// ============================================================

if (!storage.__coreDone) {

storage.__wrappers = storage.__wrappers || [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- 基本ヘルパー ---

// スペーシング定数
storage.spacing = {
  xs: 4, sm: 8, md: 12, base: 16,
  lg: 24, xl: 32, '2xl': 48, '3xl': 64
};

// テキスト作成ヘルパー（fontFamily: sourcesanspro 強制）
// penpot.createText() を直接使わないこと（fontFamily 未設定→0x0テキスト）
storage.createText = (chars, { fontSize = 16, fontWeight = 'regular', growType = 'auto-width' } = {}) => {
  const text = penpot.createText(chars);
  text.fontFamily = 'sourcesanspro';
  text.fontSize = fontSize;
  text.fontWeight = fontWeight;
  text.growType = growType;
  return text;
};

// 子要素追加ヘルパー（layoutChild null 問題を回避）
// parent.appendChild() / parent.insertChild() を直接使わないこと（layoutChild が null になる）
// Flex 親は appendChild、非 Flex 親は insertChild を使い分け、sleep 後に layoutChild を返す。
// 非 Flex 親では layoutChild は null を返す（エラーにはならない）。
storage.appendChild = async (parent, child) => {
  if (parent.flex) {
    parent.appendChild(child);
  } else if (parent.children) {
    parent.insertChild(parent.children.length, child);
  } else {
    // children 未定義（DOM未挿入ボード等）→ appendChild フォールバック
    parent.appendChild(child);
  }
  await sleep(100);
  return child.layoutChild;
};

// ページ作成 + 切替ヘルパー（ページ作成後の切替忘れ防止）
// penpot.createPage()+openPage() を直接使わないこと
// 空の "Page 1" が存在する場合はリネームして再利用する（Penpot はファイル作成時に
// Page 1 を自動生成するため、新規ページ作成前に空き Page 1 を優先利用する）。
// ファイルには最低1ページが必要なため、Page 1 の再利用はページ数の肥大化も防ぐ。
// 戻り値: 作成または再利用された Page オブジェクト
storage.createAndOpenPage = async (name) => {
  let page;
  const pages = penpotUtils.getPages();

  // 同名ページが存在すれば再利用
  const existing = pages.find(p => p.name === name);
  if (existing) {
    page = penpotUtils.getPageById(existing.id);
    penpot.openPage(page, false);
    await sleep(200);
    return page;
  }

  // 空の Page 1 を探して再利用
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
  await sleep(200);
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
    await sleep(100);
    const threads = await penpot.currentPage.findCommentThreads({
      onlyYours: false, showResolved: false
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
// penpot.library.connectLibrary() を直接使わないこと（返り値 name:null, components:[] 問題）
// 接続後に penpot.library.connected から取得し直すことで正しい値を返す。
storage.connectLibrary = async (libraryId) => {
  await penpot.library.connectLibrary(libraryId);
  const lib = penpot.library.connected.find(l => l.id === libraryId);
  if (!lib) {
    throw new Error(`[connectLibrary] 接続後にライブラリが見つかりません: ${libraryId}`);
  }
  return lib;
};

// 現在のページのボード一覧を返す（ページ選択後に呼び出す）
storage.getPageContext = () => {
  const boards = penpotUtils.findShapes(s => s.type === 'board', penpot.currentPage.root);
  return {
    page: { id: penpot.currentPage.id, name: penpot.currentPage.name },
    boards: boards.map(b => ({ id: b.id, name: b.name, width: b.width, height: b.height })),
  };
};

// トークンセットの active 状態を永続的に切替（ブリッジサーバー経由 Playwright UI 自動化）
// Plugin API の set.active は永続化されない。永続化にはこの関数を使用する。
storage.toggleSetPersistent = async (setName, active) => {
  const res = await fetch('http://localhost:3000/token-theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'toggle-set', setName, active })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`toggleSetPersistent failed: ${err.error || res.status}`);
  }
  return res.json();
};

// テーマ切替（Dark/Light）— 複数セットの active 状態を一括で永続的に変更
// 先に inactiveSets を無効にしてから activeSets を有効にする（トークン競合防止）
// 例: await storage.switchThemePersistent(['Shared', 'Dark'], ['Light'])
storage.switchThemePersistent = async (activeSets, inactiveSets) => {
  const results = [];
  for (const name of inactiveSets) {
    results.push(await storage.toggleSetPersistent(name, false));
  }
  for (const name of activeSets) {
    results.push(await storage.toggleSetPersistent(name, true));
  }
  return results;
};

// --- デザイン検証（旧 validate-design.js）---
storage.validateDesign = (opts = {}) => {
  const root = opts.board || penpot.currentPage.root;
  const issues = [];

  // ページ検証: 期待ページが指定されていれば、現在のページと一致するか確認
  if (opts.expectedPageId) {
    if (penpot.currentPage.id !== opts.expectedPageId)
      issues.push(`[ERROR] ページ不一致: 期待="${opts.expectedPageId}", 実際="${penpot.currentPage.name}" (${penpot.currentPage.id})`);
  }

  for (const t of penpotUtils.findShapes(s => s.type === 'text', root)) {
    if (t.fontFamily !== 'sourcesanspro')
      issues.push(`[ERROR] ${t.name}: fontFamily="${t.fontFamily}" → must be "sourcesanspro"`);
    if (t.width === 0 || t.height === 0)
      issues.push(`[ERROR] ${t.name}: size=${t.width}x${t.height} (font not loaded?)`);
    if (t.growType === 'fixed')
      issues.push(`[WARN] ${t.name}: growType="fixed" (overflow risk)`);
  }

  // Flex コンテナ内のレイアウト崩れヒューリスティック検出
  const flexBoards = penpotUtils.findShapes(s => s.type === 'board' && s.flex, root);
  for (const fb of flexBoards) {
    const children = penpotUtils.findShapes(s => true, fb).filter(c => {
      // 直接の子要素のみ（findShapes は再帰的なので親IDで絞る）
      try { return c.layoutChild && c.layoutChild.horizontalSizing === 'fixed'; } catch(e) { return false; }
    });
    // 固定幅の子要素が親より幅広い場合
    for (const child of children) {
      if (child.width > fb.width && child.type !== 'board') {
        issues.push(`[WARN] ${child.name}: 固定幅 ${child.width}px が親 "${fb.name}" (${fb.width}px) を超過`);
      }
    }
    // Flex 親のパディングが極端に小さい場合の警告
    // Plugin API は個別プロパティ（topPadding 等）で読み取り
    const minPad = Math.min(
      fb.flex.topPadding || 0, fb.flex.rightPadding || 0,
      fb.flex.bottomPadding || 0, fb.flex.leftPadding || 0
    );
    const hasFixedText = penpotUtils.findShapes(
      s => s.type === 'text' && s.growType === 'fixed', fb
    ).length > 0;
    if (hasFixedText && minPad < 4) {
      issues.push(`[WARN] "${fb.name}": Flex内に固定テキストあり + パディング ${minPad}px（テキスト見切れリスク）`);
    }
    // gap=0 検出: 子要素2個以上で rowGap=0 かつ columnGap=0
    const directChildren = fb.children || [];
    if (directChildren.length >= 2) {
      const rg = fb.flex.rowGap ?? 0;
      const cg = fb.flex.columnGap ?? 0;
      if (rg === 0 && cg === 0) {
        issues.push(`[WARN] "${fb.name}": Flex に子要素${directChildren.length}個あるが gap=0（要素が密着）`);
      }
    }
  }

  // 空ボード検出（Root Frame 除く）
  const allBoards = penpotUtils.findShapes(s => s.type === 'board', root);
  for (const b of allBoards) {
    if (b === root) continue;
    const bc = b.children || [];
    if (bc.length === 0) {
      issues.push(`[WARN] "${b.name}": 空のボード（子要素なし）`);
    }
  }

  // ページ名重複検出
  if (!opts.board) {
    const pageNames = penpotUtils.getPages().map(p => p.name);
    const seen = {};
    for (const n of pageNames) {
      seen[n] = (seen[n] || 0) + 1;
    }
    for (const [n, count] of Object.entries(seen)) {
      if (count > 1) {
        issues.push(`[WARN] ページ名 "${n}" が${count}件重複`);
      }
    }
  }

  // インタラクション検証
  const interactiveShapes = penpotUtils.findShapes(s => s.interactions && s.interactions.length > 0, root);
  for (const s of interactiveShapes) {
    for (const ix of s.interactions) {
      const action = ix.action;
      if (!action) continue;
      if (action.type === 'navigate-to') {
        if (!action.destination) {
          issues.push(`[ERROR] "${s.name}": navigate-to の destination が未設定`);
        } else {
          // destination 参照先がページ上に存在するか確認
          const dest = penpotUtils.findShapes(sh => sh.id === action.destination.id, penpot.currentPage.root);
          if (dest.length === 0) {
            issues.push(`[ERROR] "${s.name}": navigate-to の destination が現在のページに存在しない`);
          }
        }
      }
    }
  }

  // トークン未適用検出（opt-in）
  if (opts.checkTokenCoverage) {
    const catalog = penpot.library.local.tokens;
    if (catalog.sets.length > 0) {
      const shapes = penpotUtils.findShapes(s => s.type !== 'board' && s.fills && s.fills.length > 0, root);
      let untokenized = 0;
      for (const s of shapes) {
        const hasToken = s.appliedTokens && Object.keys(s.appliedTokens).length > 0;
        if (!hasToken) untokenized++;
      }
      if (untokenized > 0) {
        issues.push(`[INFO] トークン未適用のシェイプが${untokenized}件（checkTokenCoverage）`);
      }
    }
  }

  return issues.length ? issues : 'All checks passed.';
};

storage.__wrappers.push(
  { fn: 'storage.createText(chars, opts)', replaces: 'penpot.createText()', reason: 'fontFamily 自動設定（未設定→0x0テキスト）' },
  { fn: 'await storage.appendChild(parent, child)', replaces: 'parent.appendChild()+sleep+layoutChild', reason: 'Flex/非Flex判定+sleep+layoutChild返却（null回避）' },
  { fn: 'storage.createAndOpenPage(name)', replaces: 'penpot.createPage()+openPage()', reason: '同名ページ再利用・切替検証・Page 1 再利用' },
  { fn: 'storage.connectLibrary(id)', replaces: 'penpot.library.connectLibrary()', reason: '返り値キャッシュ問題回避' },
  { fn: 'storage.assertCurrentPage(pageOrId)', replaces: null, reason: 'ページ検証ガード' },
  { fn: 'storage.getFileComments()', replaces: null, reason: 'ページ横断コメント取得' },
  { fn: 'storage.toggleSetPersistent(name, bool)', replaces: 'set.active = bool', reason: 'set.active は永続化されない（UI 自動化で回避）' },
  { fn: 'storage.switchThemePersistent(active[], inactive[])', replaces: null, reason: '複数セットの永続的テーマ切替' },
  { fn: 'storage.getPageContext()', replaces: null, reason: 'ページ選択後のボード一覧取得' },
  { fn: 'storage.spacing', replaces: null, reason: '{xs:4,sm:8,md:12,base:16,lg:24,xl:32,2xl:48,3xl:64}' },
  { fn: 'storage.validateDesign(opts)', replaces: null, reason: 'デザイン検証（font/size/page/gap/空ボード/ページ名重複/インタラクション）' },
);

storage.__coreDone = true;
}

// ── context/metrics（activate 毎に最新値）──
const pages = penpotUtils.getPages();
const tokenSets = penpot.library.local.tokens?.sets ?? [];
const components = penpot.library.local.components ?? [];
const connectedLibs = penpot.library.connected ?? [];

return {
  message: 'penpot-init 完了。'
    + 'context: ファイルレベルの現在状態。'
    + 'metrics: フェーズ判定用数値（SKILL.md 参照）。'
    + 'ページ選択後は storage.getPageContext() でボード一覧取得。',
  caution: 'storage ラッパーを対応する penpot ネイティブメソッドの代わりに使用すること。直接使用はバグ回避策を無効化する。',
  wrappers: storage.__wrappers || [],
  context: {
    currentPage: { id: penpot.currentPage.id, name: penpot.currentPage.name },
    pages: pages.map(p => ({ id: p.id, name: p.name })),
    tokenSets: tokenSets.map(s => s.name),
    componentCount: components.length,
    connectedLibs: connectedLibs.map(l => ({ id: l.id, name: l.name ?? l.id })),
  },
  metrics: {
    tokenSets: tokenSets.length,
    components: components.length,
    connectedLibs: connectedLibs.length,
    pages: pages.length,
  },
};
