// ============================================================
// Penpot Design Token Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.VALID_TOKEN_TYPES, storage.TOKEN_PROPERTY_MAP,
//           storage.findToken, storage.findTokenOrNull,
//           storage.ensureTokenSet, storage.ensureToken,
//           storage.ensureTokenBatch, storage.applyTokenSafe,
//           storage.applyTokenToShapesSafe
//
// NOTE: ensureTokenSet, ensureToken, ensureTokenBatch,
//       applyTokenSafe, applyTokenToShapesSafe は async 関数。
//       呼び出し時に必ず await を付けること。
//       UI 更新をトリガーする操作の後に sleep を挟み、
//       MCP WebSocket 切断を防止する。
// ============================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 有効な TokenType 定数
storage.VALID_TOKEN_TYPES = [
  'color', 'dimension', 'spacing', 'typography', 'shadow',
  'opacity', 'borderRadius', 'borderWidth', 'fontWeights',
  'fontSizes', 'fontFamilies', 'letterSpacing', 'textDecoration',
  'textCase', 'number', 'rotation', 'sizing'
];

// TokenType → 適用可能 TokenProperty[] のマップ
storage.TOKEN_PROPERTY_MAP = {
  color:          ['fill', 'stroke-color'],
  dimension:      ['x', 'y', 'stroke-width'],
  spacing:        ['row-gap', 'column-gap', 'p1', 'p2', 'p3', 'p4', 'm1', 'm2', 'm3', 'm4'],
  typography:     ['typography'],
  shadow:         ['shadow'],
  opacity:        ['opacity'],
  borderRadius:   ['r1', 'r2', 'r3', 'r4'],
  borderWidth:    ['stroke-width'],
  fontWeights:    ['font-weight'],
  fontSizes:      ['font-size'],
  fontFamilies:   ['font-families'],
  letterSpacing:  ['letter-spacing'],
  textDecoration: ['text-decoration'],
  textCase:       ['text-case'],
  number:         ['rotation', 'line-height'],
  rotation:       ['rotation'],
  sizing:         ['width', 'height', 'layout-item-min-w', 'layout-item-max-w', 'layout-item-min-h', 'layout-item-max-h']
};

// トークン検索（見つからなければ登録済み名を含むエラーを投げる）
storage.findToken = (name) => {
  const token = penpotUtils.findTokenByName(name);
  if (token) return token;
  // 登録済みトークン名を収集してエラーメッセージに含める
  const overview = penpotUtils.tokenOverview();
  const registered = [];
  for (const [setName, types] of Object.entries(overview)) {
    for (const [type, names] of Object.entries(types)) {
      registered.push(...names);
    }
  }
  const hint = registered.length > 0
    ? ` 登録済みトークン: ${registered.slice(0, 20).join(', ')}${registered.length > 20 ? ` ...他${registered.length - 20}件` : ''}`
    : ' トークンが1件も登録されていません。';
  throw new Error(`[findToken] トークン "${name}" が見つかりません。${hint}`);
};

// トークン検索（見つからなければ null）
storage.findTokenOrNull = (name) => {
  return penpotUtils.findTokenByName(name) || null;
};

// 冪等なトークンセット取得/作成（async）
// opts.activate: セットを有効化するか（デフォルト true）
// 戻り値: { set, created }
storage.ensureTokenSet = async (name, opts) => {
  const activate = opts?.activate !== false;
  const catalog = penpot.library.local.tokens;
  let set = catalog.sets.find(s => s.name === name);
  if (set) {
    if (activate && !set.active) {
      set.toggleActive();
      await sleep(100);
    }
    return { set, created: false };
  }
  set = catalog.addSet(name);
  await sleep(100);
  if (activate && !set.active) {
    set.toggleActive();
    await sleep(100);
  }
  return { set, created: true };
};

// 冪等なトークン取得/作成/更新（async）
// タイプ妥当性チェック付き
// 戻り値: { token, action } (action: 'found' | 'created' | 'updated')
storage.ensureToken = async (set, type, name, value, opts) => {
  // タイプ妥当性チェック
  if (!storage.VALID_TOKEN_TYPES.includes(type)) {
    throw new Error(
      `[ensureToken] 無効なトークンタイプ "${type}"。` +
      ` 有効なタイプ: ${storage.VALID_TOKEN_TYPES.join(', ')}`
    );
  }
  // 既存トークンを検索
  const existing = set.tokens.find(t => t.name === name);
  if (existing) {
    // 値が同じなら何もしない
    if (String(existing.value) === String(value)) {
      return { token: existing, action: 'found' };
    }
    // 値が異なれば更新
    existing.value = value;
    await sleep(50);
    return { token: existing, action: 'updated' };
  }
  // 新規作成
  const token = set.addToken(type, name, String(value));
  await sleep(50);
  return { token, action: 'created' };
};

// 複数トークンの一括冪等登録（async）
// tokens: [{ type, name, value }]
// 戻り値: { results: [{ name, token, action }], errors: [{ name, error }] }
storage.ensureTokenBatch = async (set, tokens) => {
  const results = [];
  const errors = [];
  for (let i = 0; i < tokens.length; i++) {
    const { type, name, value } = tokens[i];
    try {
      const { token, action } = await storage.ensureToken(set, type, name, value);
      results.push({ name, token, action });
    } catch (e) {
      errors.push({ name, error: e.message });
    }
    // 10件ごとに追加 sleep でバースト緩和
    if ((i + 1) % 10 === 0) {
      await sleep(50);
    }
  }
  return { results, errors };
};

// 安全なトークン適用（単一シェイプ、async）
// tokenOrName: Token オブジェクト or トークン名文字列
// properties: TokenProperty[] （省略時はトークンタイプのデフォルト）
storage.applyTokenSafe = async (shape, tokenOrName, properties) => {
  if (!shape) {
    throw new Error('[applyTokenSafe] shape が null/undefined です。');
  }
  // トークン解決
  const token = typeof tokenOrName === 'string'
    ? storage.findToken(tokenOrName)
    : tokenOrName;
  if (!token) {
    throw new Error('[applyTokenSafe] token が null/undefined です。');
  }
  // プロパティ互換性チェック
  if (properties && properties.length > 0) {
    const allowed = storage.TOKEN_PROPERTY_MAP[token.type];
    if (allowed) {
      const invalid = properties.filter(p => p !== 'all' && !allowed.includes(p));
      if (invalid.length > 0) {
        throw new Error(
          `[applyTokenSafe] トークンタイプ "${token.type}" にプロパティ ${JSON.stringify(invalid)} は適用できません。` +
          ` 許可されたプロパティ: ${allowed.join(', ')}`
        );
      }
    }
  }
  shape.applyToken(token, properties);
  await sleep(100);
};

// 複数シェイプへの安全な一括適用（async）
// tokenOrName: Token オブジェクト or トークン名文字列
// shapes: Shape[]
// properties: TokenProperty[]
storage.applyTokenToShapesSafe = async (tokenOrName, shapes, properties) => {
  if (!shapes || !Array.isArray(shapes) || shapes.length === 0) {
    throw new Error('[applyTokenToShapesSafe] shapes が空または無効です。');
  }
  // トークン解決
  const token = typeof tokenOrName === 'string'
    ? storage.findToken(tokenOrName)
    : tokenOrName;
  if (!token) {
    throw new Error('[applyTokenToShapesSafe] token が null/undefined です。');
  }
  // プロパティ互換性チェック
  if (properties && properties.length > 0) {
    const allowed = storage.TOKEN_PROPERTY_MAP[token.type];
    if (allowed) {
      const invalid = properties.filter(p => p !== 'all' && !allowed.includes(p));
      if (invalid.length > 0) {
        throw new Error(
          `[applyTokenToShapesSafe] トークンタイプ "${token.type}" にプロパティ ${JSON.stringify(invalid)} は適用できません。` +
          ` 許可されたプロパティ: ${allowed.join(', ')}`
        );
      }
    }
  }
  token.applyToShapes(shapes, properties);
  await sleep(100);
};
