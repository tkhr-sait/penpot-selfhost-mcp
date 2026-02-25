// ============================================================
// Penpot Token Utilities (init.d: 10)
//
// activate 時に自動実行。冪等（再呼び出しでも安全）。
//
// Provides: storage.VALID_TOKEN_TYPES, storage.TOKEN_PROPERTY_MAP,
//           storage.findToken, storage.findTokenOrNull,
//           storage.ensureTokenSet, storage.ensureToken,
//           storage.ensureTokenBatch, storage.applyTokenSafe,
//           storage.applyTokenToShapesSafe, storage.ensureTheme
// ============================================================

if (!storage.__tokenUtilsDone) {

storage.__wrappers = storage.__wrappers || [];
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
  catalog.addSet(name);
  await sleep(100);
  set = catalog.sets.find(s => s.name === name);
  if (activate && !set.active) {
    set.toggleActive();
    await sleep(100);
  }
  return { set, created: true };
};

// 冪等なトークン取得/作成/更新（async）
storage.ensureToken = async (set, type, name, value, opts) => {
  if (!storage.VALID_TOKEN_TYPES.includes(type)) {
    throw new Error(
      `[ensureToken] 無効なトークンタイプ "${type}"。` +
      ` 有効なタイプ: ${storage.VALID_TOKEN_TYPES.join(', ')}`
    );
  }
  const existing = set.tokens.find(t => t.name === name);
  if (existing) {
    if (String(existing.value) === String(value)) {
      return { token: existing, action: 'found' };
    }
    existing.remove();
    await sleep(50);
    const updated = set.addToken(type, name, String(value));
    await sleep(50);
    return { token: updated, action: 'updated' };
  }
  const token = set.addToken(type, name, String(value));
  await sleep(50);
  return { token, action: 'created' };
};

// 複数トークンの一括冪等登録（async）
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
    if ((i + 1) % 10 === 0) {
      await sleep(200);
    }
  }
  return { results, errors };
};

// 安全なトークン適用（単一シェイプ、async）
storage.applyTokenSafe = async (shape, tokenOrName, properties) => {
  if (!shape) {
    throw new Error('[applyTokenSafe] shape が null/undefined です。');
  }
  const token = typeof tokenOrName === 'string'
    ? storage.findToken(tokenOrName)
    : tokenOrName;
  if (!token) {
    throw new Error('[applyTokenSafe] token が null/undefined です。');
  }
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
storage.applyTokenToShapesSafe = async (tokenOrName, shapes, properties) => {
  if (!shapes || !Array.isArray(shapes) || shapes.length === 0) {
    throw new Error('[applyTokenToShapesSafe] shapes が空または無効です。');
  }
  const token = typeof tokenOrName === 'string'
    ? storage.findToken(tokenOrName)
    : tokenOrName;
  if (!token) {
    throw new Error('[applyTokenToShapesSafe] token が null/undefined です。');
  }
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

/**
 * 冪等なテーマ作成+セット関連付け。
 * theme.addSet() はセッション限定（永続化は switchThemePersistent で別途行う）
 */
storage.ensureTheme = async (group, name, sets) => {
  const catalog = penpot.library.local.tokens;
  let theme = catalog.themes.find(t => t.name === name);
  let created = false;
  if (!theme) {
    catalog.addTheme(group, name);
    await sleep(100);
    theme = catalog.themes.find(t => t.name === name);
    if (!theme) throw new Error(`[ensureTheme] テーマ "${name}" の作成に失敗`);
    created = true;
  }
  for (const set of sets) {
    theme.addSet(set);
    await sleep(50);
  }
  // セッション内でテーマ→セットの関連をキャッシュ（exportTokensDTCG で使用）
  storage.__themeSetMap = storage.__themeSetMap || {};
  storage.__themeSetMap[name] = sets.map(s => s.name);
  return { theme, created };
};

// デフォルトセマンティックトークン定数
storage.SEMANTIC_TOKEN_DEFAULTS = {
  shared: [
    { type: 'spacing', name: 'space.xs', value: '4' },
    { type: 'spacing', name: 'space.sm', value: '8' },
    { type: 'spacing', name: 'space.md', value: '12' },
    { type: 'spacing', name: 'space.base', value: '16' },
    { type: 'spacing', name: 'space.lg', value: '24' },
    { type: 'spacing', name: 'space.xl', value: '32' },
    { type: 'spacing', name: 'space.2xl', value: '48' },
    { type: 'spacing', name: 'space.3xl', value: '64' },
    { type: 'borderRadius', name: 'radius.sm', value: '4' },
    { type: 'borderRadius', name: 'radius.md', value: '8' },
    { type: 'borderRadius', name: 'radius.lg', value: '12' },
    { type: 'borderRadius', name: 'radius.xl', value: '16' },
  ],
  colors: {
    'surface-primary':    { light: '#FFFFFF', dark: '#1A1A2E' },
    'surface-card':       { light: '#F8F9FA', dark: '#2D2D44' },
    'surface-secondary':  { light: '#E9ECEF', dark: '#16213E' },
    'surface-info':       { light: '#E8F4FD', dark: '#1A3A5C' },
    'text-heading':       { light: '#1A1A2E', dark: '#F8F9FA' },
    'text-primary':       { light: '#2D2D44', dark: '#E0E0E0' },
    'text-secondary':     { light: '#6C757D', dark: '#9E9E9E' },
    'text-on-accent':     { light: '#FFFFFF', dark: '#FFFFFF' },
    'accent-blue':        { light: '#4A90D9', dark: '#6DB3F8' },
    'accent-green':       { light: '#28A745', dark: '#4CAF50' },
    'accent-error':       { light: '#DC3545', dark: '#EF5350' },
    'accent-error-light': { light: '#F8D7DA', dark: '#4A1C1C' },
    'border-primary':     { light: '#DEE2E6', dark: '#3D3D5C' },
    'border-light':       { light: '#E9ECEF', dark: '#2D2D44' },
  },
  typography: [
    { type: 'fontSizes', name: 'font-size.display', value: '48' },
    { type: 'fontSizes', name: 'font-size.h1', value: '32' },
    { type: 'fontSizes', name: 'font-size.h2', value: '24' },
    { type: 'fontSizes', name: 'font-size.h3', value: '20' },
    { type: 'fontSizes', name: 'font-size.body-lg', value: '18' },
    { type: 'fontSizes', name: 'font-size.body', value: '16' },
    { type: 'fontSizes', name: 'font-size.body-sm', value: '14' },
    { type: 'fontSizes', name: 'font-size.caption', value: '12' },
    { type: 'fontSizes', name: 'font-size.overline', value: '11' },
    { type: 'fontWeights', name: 'font-weight.regular', value: 'regular' },
    { type: 'fontWeights', name: 'font-weight.semibold', value: 'semibold' },
    { type: 'fontWeights', name: 'font-weight.bold', value: 'bold' },
  ],
};

/**
 * デフォルトセマンティックトークンを一括登録。
 * opts.overrides: { 'accent-blue': { light: '#custom', dark: '#custom' } }
 * opts.force: boolean — 既存トークンも上書き（デフォルト false = 既存スキップ）
 * opts.skipTheme: boolean — テーマ作成・切替をスキップ
 * opts.includeTypography: boolean — fontSizes/fontWeights トークンも登録
 */
storage.ensureSemanticTokens = async (opts) => {
  const defaults = storage.SEMANTIC_TOKEN_DEFAULTS;
  const force = opts?.force ?? false;
  const overrides = opts?.overrides ?? {};

  // 1. セット作成
  const { set: shared } = await storage.ensureTokenSet('Shared');
  const { set: light } = await storage.ensureTokenSet('Light');
  const { set: dark } = await storage.ensureTokenSet('Dark');

  // 2. Shared トークン — 既存をフィルタしてバッチ投入
  const existingShared = new Set(shared.tokens.map(t => t.name));
  const newShared = force
    ? [...defaults.shared]
    : defaults.shared.filter(t => !existingShared.has(t.name));
  if (opts?.includeTypography) {
    const typo = force
      ? defaults.typography
      : defaults.typography.filter(t => !existingShared.has(t.name));
    newShared.push(...typo);
  }
  if (newShared.length > 0) {
    await storage.ensureTokenBatch(shared, newShared);
  }

  // 3. Light / Dark カラートークン — バッチ投入
  const existingLight = new Set(light.tokens.map(t => t.name));
  const lightTokens = [];
  const darkTokens = [];
  for (const [name, vals] of Object.entries(defaults.colors)) {
    if (!force && existingLight.has(name)) continue;
    const ov = overrides[name] || {};
    lightTokens.push({ type: 'color', name, value: ov.light || vals.light });
    darkTokens.push({ type: 'color', name, value: ov.dark || vals.dark });
  }
  if (lightTokens.length > 0) await storage.ensureTokenBatch(light, lightTokens);
  if (darkTokens.length > 0) await storage.ensureTokenBatch(dark, darkTokens);

  // 4. テーマ作成 + 永続切替
  if (!opts?.skipTheme) {
    await storage.ensureTheme('Appearance', 'Light', [shared, light]);
    await storage.ensureTheme('Appearance', 'Dark', [shared, dark]);
    await storage.switchThemePersistent(['Shared', 'Light'], ['Dark']);
  }

  return penpotUtils.tokenOverview();
};

storage.__wrappers.push(
  { fn: 'await storage.ensureTokenSet(name, opts)', replaces: 'catalog.addSet()+find()', reason: '冪等セット作成' },
  { fn: 'await storage.ensureToken(set, type, name, value)', replaces: 'set.addToken()', reason: '冪等トークン作成/更新' },
  { fn: 'await storage.ensureTokenBatch(set, tokens[])', replaces: null, reason: '一括トークン登録（10件バッチ+sleep）' },
  { fn: 'await storage.applyTokenSafe(shape, name, props[])', replaces: 'shape.applyToken()', reason: '型チェック+null安全+sleep' },
  { fn: 'await storage.applyTokenToShapesSafe(name, shapes[], props[])', replaces: 'token.applyToShapes()', reason: '一括適用' },
  { fn: 'storage.findToken(name) / findTokenOrNull(name)', replaces: 'penpotUtils.findTokenByName()', reason: 'エラーヒント付き検索' },
  { fn: 'storage.ensureTheme(group, name, sets[])', replaces: 'catalog.addTheme()+find()+addSet()', reason: '冪等テーマ作成+セット関連付け（addSet はセッション限定）' },
  { fn: 'await storage.ensureSemanticTokens(opts?)', replaces: null, reason: 'デフォルト14色+spacing+borderRadius一括登録（force/overrides/skipTheme/includeTypography）' },
  { fn: 'storage.SEMANTIC_TOKEN_DEFAULTS', replaces: null, reason: 'デフォルトトークン定数（shared/colors/typography）' },
  { fn: 'storage.VALID_TOKEN_TYPES', replaces: null, reason: '有効なトークンタイプ一覧' },
  { fn: 'storage.TOKEN_PROPERTY_MAP', replaces: null, reason: 'トークンタイプ→プロパティ対応表' },
);

storage.__tokenUtilsDone = true;
}
