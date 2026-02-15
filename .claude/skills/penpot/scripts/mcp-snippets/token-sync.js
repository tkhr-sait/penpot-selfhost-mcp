// ============================================================
// Penpot Token Sync Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.exportTokensDTCG,
//           storage.importTokensDTCG,
//           storage.resumeImport,
//           storage.generateStyleDictionaryConfig
// ============================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Export: Penpot → W3C DTCG JSON ---

storage.exportTokensDTCG = () => {
  const catalog = penpot.library.local.tokens;
  const sets = catalog.sets;
  const themes = catalog.themes;

  // fontFamilies: ClojureScript PersistentVector → CSS 名マッピング
  const fontNameMap = {
    'sourcesanspro': 'Source Sans Pro, sans-serif',
  };

  // Penpot トークン型のうち DTCG dimension にマッピングされるもの（px 自動付与対象）
  const dimensionTypes = new Set([
    'dimension', 'spacing', 'sizing', 'borderRadius',
    'borderWidth', 'fontSizes', 'letterSpacing'
  ]);

  // Map Penpot token type to DTCG $type
  const typeMap = {
    color: 'color',
    dimension: 'dimension',
    spacing: 'dimension',
    sizing: 'dimension',
    borderRadius: 'dimension',
    borderWidth: 'dimension',
    opacity: 'number',
    fontFamilies: 'fontFamily',
    fontWeights: 'fontWeight',
    fontSizes: 'dimension',
    letterSpacing: 'dimension',
    rotation: 'number',
    textCase: 'string',
    textDecoration: 'string',
    number: 'number',
    typography: 'typography',
    shadow: 'shadow'
  };

  // DTCG $type が Penpot 型と異なるもの（$extensions 保存対象）
  const needsExtension = new Set([
    'spacing', 'sizing', 'borderRadius', 'borderWidth',
    'fontSizes', 'letterSpacing', 'rotation', 'opacity',
    'textCase', 'textDecoration'
  ]);

  // fontFamilies 値の解決: PersistentVector 等の内部構造を CSS 互換文字列に変換
  const resolveFontFamily = (token) => {
    // 1. fontNameMap でマッピング
    const rawVal = String(token.value || '').replace(/\s/g, '').toLowerCase();
    if (fontNameMap[rawVal]) return fontNameMap[rawVal];

    // 2. resolvedValue を試す
    const resolved = token.resolvedValue;
    if (typeof resolved === 'string' && resolved.length > 0) return resolved;

    // 3. PersistentVector 対策: $tail$ 配列から文字列を抽出
    const val = token.value;
    if (val && typeof val === 'object') {
      if (Array.isArray(val.$tail$)) {
        const str = val.$tail$.find(v => typeof v === 'string');
        if (str) return str;
      }
      // 配列の場合
      if (Array.isArray(val) && val.length > 0) {
        return val.join(', ');
      }
    }

    // 4. フォールバック
    return String(token.value);
  };

  // dimension 系値に px サフィックスを付与（参照 {xxx} やすでに単位付きはスキップ）
  const ensurePxUnit = (value) => {
    const str = String(value);
    // トークン参照はそのまま
    if (str.startsWith('{') && str.endsWith('}')) return str;
    // すでに単位が付いている場合はスキップ
    if (/[a-z%]+$/i.test(str)) return str;
    // 純粋な数値なら px を付与
    if (/^-?\d+(\.\d+)?$/.test(str)) return str + 'px';
    return str;
  };

  // Build DTCG-compatible structure
  // Each token set becomes a top-level key
  const dtcg = {};

  for (const tokenSet of sets) {
    const setObj = {};
    for (const token of tokenSet.tokens) {
      // Parse dot-separated name into nested structure
      const parts = token.name.split('.');
      let current = setObj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      const leaf = parts[parts.length - 1];

      // 値の解決
      let value = token.value;
      if (token.type === 'fontFamilies') {
        value = resolveFontFamily(token);
      } else if (dimensionTypes.has(token.type)) {
        value = ensurePxUnit(value);
      }

      const entry = {
        $value: value,
        $type: typeMap[token.type] || token.type
      };
      if (token.description) {
        entry.$description = token.description;
      }
      // DTCG $type から Penpot 元型を復元できない場合、$extensions に保存
      if (needsExtension.has(token.type)) {
        entry.$extensions = { 'com.penpot': { type: token.type } };
      }
      current[leaf] = entry;
    }
    dtcg[tokenSet.name] = setObj;
  }

  // Add $themes metadata
  if (themes.length > 0) {
    dtcg.$themes = themes.map(theme => ({
      name: theme.name,
      group: theme.group,
      sets: (theme.activeSets || []).map(s => s.name)
    }));
  }

  return JSON.stringify(dtcg, null, 2);
};

// --- Import: DTCG JSON → Penpot (バッチ + sleep + 再開機能) ---

// Reverse DTCG $type to Penpot TokenType
const _reverseTypeMap = {
  color: 'color',
  dimension: 'dimension',
  number: 'number',
  fontFamily: 'fontFamilies',
  fontWeight: 'fontWeights',
  string: 'textCase', // ambiguous, but best default
  typography: 'typography',
  shadow: 'shadow'
};

// DTCG ネスト構造をフラットなトークン配列に変換
const _flattenDTCG = (obj, prefix) => {
  const result = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const fullName = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && val.$value !== undefined) {
      // $extensions から Penpot 元型を抽出（あれば）
      const penpotType = val.$extensions?.['com.penpot']?.type || null;
      result.push({
        name: fullName,
        value: typeof val.$value === 'object' ? JSON.stringify(val.$value) : String(val.$value),
        type: val.$type,
        penpotType,
        description: val.$description || ''
      });
    } else if (val && typeof val === 'object') {
      result.push(..._flattenDTCG(val, fullName));
    }
  }
  return result;
};

// バッチサイズ・sleep 設定
const IMPORT_BATCH_SIZE = 10;
const IMPORT_BATCH_SLEEP_MS = 200;
const IMPORT_SET_OP_SLEEP_MS = 100;   // addSet, toggleActive 後
const IMPORT_TOKEN_OP_SLEEP_MS = 50;  // addToken, value 更新後

// --- 内部関数: セット準備とトークンバッチ処理 ---

// セットの取得/作成・有効化、フラットトークンリスト生成
// 戻り値: { allBatchItems, existingSets, existingTokensBySet, stats }
const _prepareSets = async (dtcg, stats) => {
  const catalog = penpot.library.local.tokens;
  const existingSets = {};
  for (const s of catalog.sets) {
    existingSets[s.name] = s;
  }

  const allBatchItems = [];
  // セットごとの既存トークンマップを事前構築（O(n) で済む + 重複作成防止）
  const existingTokensBySet = {};

  for (const [setName, setData] of Object.entries(dtcg)) {
    if (setName.startsWith('$')) continue;

    // Get or create token set
    let tokenSet = existingSets[setName];
    if (!tokenSet) {
      catalog.addSet(setName);
      await sleep(IMPORT_SET_OP_SLEEP_MS);
      // addSet() 戻り値のプロパティ即時読取不可 → catalog.sets から再取得
      tokenSet = catalog.sets.find(s => s.name === setName);
      existingSets[setName] = tokenSet;
      stats.setsCreated++;
    } else {
      stats.setsUpdated++;
    }

    // Ensure set is active
    if (!tokenSet.active) {
      tokenSet.toggleActive();
      await sleep(IMPORT_SET_OP_SLEEP_MS);
    }

    // 既存トークンマップを事前構築
    const tokenMap = {};
    for (const tk of tokenSet.tokens) {
      tokenMap[tk.name] = tk;
    }
    existingTokensBySet[setName] = tokenMap;

    const flatTokens = _flattenDTCG(setData, '');
    for (const t of flatTokens) {
      allBatchItems.push({ setName, token: t });
    }
  }

  return { allBatchItems, existingSets, existingTokensBySet, stats };
};

// バッチ分割 + 処理（startIndex から開始）
// existingTokensBySet を更新しながら処理し、重複作成を防止
const _processTokenBatches = async (allBatchItems, existingSets, existingTokensBySet, stats, startIndex) => {
  const batches = [];
  for (let i = 0; i < allBatchItems.length; i += IMPORT_BATCH_SIZE) {
    batches.push(allBatchItems.slice(i, i + IMPORT_BATCH_SIZE));
  }

  for (let bi = startIndex; bi < batches.length; bi++) {
    const batch = batches[bi];

    for (const { setName, token: t } of batch) {
      const tokenSet = existingSets[setName];
      const tokenMap = existingTokensBySet[setName];

      // $extensions の penpotType を優先、なければ _reverseTypeMap、最終フォールバックは dimension
      const penpotType = t.penpotType || _reverseTypeMap[t.type] || t.type || 'dimension';

      if (tokenMap[t.name]) {
        const existing = tokenMap[t.name];
        if (String(existing.value) !== String(t.value)) {
          // value は読み取り専用 → remove + addToken で更新
          existing.remove();
          await sleep(IMPORT_TOKEN_OP_SLEEP_MS);
          tokenSet.addToken(penpotType, t.name, t.value);
          tokenMap[t.name] = true; // マーカー更新
          await sleep(IMPORT_TOKEN_OP_SLEEP_MS);
          stats.tokensUpdated++;
        }
      } else {
        tokenSet.addToken(penpotType, t.name, t.value);
        // マップに追加して同バッチ内の重複作成を防止
        tokenMap[t.name] = true;
        await sleep(IMPORT_TOKEN_OP_SLEEP_MS);
        stats.tokensCreated++;
      }
    }

    // 進捗更新
    storage._importProgress.nextBatchIndex = bi + 1;
    storage._importProgress.stats = { ...stats };

    // バッチ間 sleep（最後のバッチ以外）
    if (bi < batches.length - 1) {
      await sleep(IMPORT_BATCH_SLEEP_MS);
    }
  }

  return stats;
};

// --- Public API ---

storage.importTokensDTCG = async (jsonString) => {
  const dtcg = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  const initialStats = { setsCreated: 0, setsUpdated: 0, tokensCreated: 0, tokensUpdated: 0 };

  const { allBatchItems, existingSets, existingTokensBySet, stats } =
    await _prepareSets(dtcg, initialStats);

  // バッチ数を計算
  const totalBatches = Math.ceil(allBatchItems.length / IMPORT_BATCH_SIZE);

  // 進捗保存の初期化
  storage._importProgress = {
    totalBatches,
    totalTokens: allBatchItems.length,
    nextBatchIndex: 0,
    stats: { ...stats },
    dtcg, // 再開用に DTCG データを保持
  };

  const finalStats = await _processTokenBatches(
    allBatchItems, existingSets, existingTokensBySet, stats, 0
  );

  // 全バッチ完了 → 進捗クリア
  storage._importProgress = null;
  return finalStats;
};

// --- 再開機能: 中断後に途中から再開 ---

storage.resumeImport = async () => {
  const progress = storage._importProgress;
  if (!progress || !progress.dtcg) {
    return { error: 'No import in progress. Use storage.importTokensDTCG() to start.' };
  }

  const { dtcg, nextBatchIndex } = progress;
  const stats = { ...progress.stats };

  const { allBatchItems, existingSets, existingTokensBySet } =
    await _prepareSets(dtcg, stats);

  const finalStats = await _processTokenBatches(
    allBatchItems, existingSets, existingTokensBySet, stats, nextBatchIndex
  );

  // 全バッチ完了 → 進捗クリア
  storage._importProgress = null;
  return finalStats;
};

// --- Style Dictionary Config Generator ---

storage.generateStyleDictionaryConfig = (opts = {}) => {
  const {
    tokensDir = 'tokens',
    buildDir = 'build/',
    prefix = 'ds'
  } = opts;

  return `import StyleDictionary from 'style-dictionary';

export default {
  source: ['${tokensDir}/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: '${prefix}',
      buildPath: '${buildDir}css/',
      files: [{
        destination: 'variables.css',
        format: 'css/variables',
        options: { outputReferences: true }
      }]
    },
    scss: {
      transformGroup: 'scss',
      prefix: '${prefix}',
      buildPath: '${buildDir}scss/',
      files: [{
        destination: '_tokens.scss',
        format: 'scss/variables',
        options: { outputReferences: true }
      }]
    },
    tailwind: {
      transformGroup: 'js',
      buildPath: '${buildDir}tailwind/',
      files: [{
        destination: 'tokens.js',
        format: 'javascript/es6'
      }]
    }
  }
};
`;
};

return 'Token sync utilities initialized: storage.exportTokensDTCG, storage.importTokensDTCG, storage.resumeImport, storage.generateStyleDictionaryConfig';
