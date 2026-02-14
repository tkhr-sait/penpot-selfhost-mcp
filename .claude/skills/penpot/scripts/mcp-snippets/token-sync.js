// ============================================================
// Penpot Token Sync Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.exportTokensDTCG,
//           storage.importTokensDTCG,
//           storage.generateStyleDictionaryConfig
// ============================================================

// --- Export: Penpot → W3C DTCG JSON ---

storage.exportTokensDTCG = () => {
  const catalog = penpot.library.local.tokens;
  const sets = catalog.sets;
  const themes = catalog.themes;

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

      const entry = {
        $value: token.value,
        $type: typeMap[token.type] || token.type
      };
      if (token.description) {
        entry.$description = token.description;
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
      sets: theme.sets.map(s => s.name)
    }));
  }

  return JSON.stringify(dtcg, null, 2);
};

// --- Import: DTCG JSON → Penpot ---

storage.importTokensDTCG = (jsonString) => {
  const dtcg = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  const catalog = penpot.library.local.tokens;

  // Reverse DTCG $type to Penpot TokenType
  const reverseTypeMap = {
    color: 'color',
    dimension: 'dimension',
    number: 'number',
    fontFamily: 'fontFamilies',
    fontWeight: 'fontWeights',
    string: 'textCase', // ambiguous, but best default
    typography: 'typography',
    shadow: 'shadow'
  };

  // Build existing set lookup
  const existingSets = {};
  for (const s of catalog.sets) {
    existingSets[s.name] = s;
  }

  const stats = { setsCreated: 0, setsUpdated: 0, tokensCreated: 0, tokensUpdated: 0 };

  for (const [setName, setData] of Object.entries(dtcg)) {
    // Skip metadata keys
    if (setName.startsWith('$')) continue;

    // Get or create token set
    let tokenSet = existingSets[setName];
    if (!tokenSet) {
      tokenSet = catalog.addSet(setName);
      existingSets[setName] = tokenSet;
      stats.setsCreated++;
    } else {
      stats.setsUpdated++;
    }

    // Ensure set is active
    if (!tokenSet.active) tokenSet.toggleActive();

    // Build existing token lookup for this set
    const existingTokens = {};
    for (const t of tokenSet.tokens) {
      existingTokens[t.name] = t;
    }

    // Flatten nested DTCG structure to dot-notation tokens
    const flatTokens = [];
    const flatten = (obj, prefix) => {
      for (const [key, val] of Object.entries(obj)) {
        if (key.startsWith('$')) continue; // skip $type, $description at group level
        const fullName = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && val.$value !== undefined) {
          flatTokens.push({
            name: fullName,
            value: typeof val.$value === 'object' ? JSON.stringify(val.$value) : String(val.$value),
            type: val.$type,
            description: val.$description || ''
          });
        } else if (val && typeof val === 'object') {
          flatten(val, fullName);
        }
      }
    };
    flatten(setData, '');

    // Add or update tokens
    for (const t of flatTokens) {
      const penpotType = reverseTypeMap[t.type] || t.type || 'dimension';
      if (existingTokens[t.name]) {
        // Token exists — update value if different
        const existing = existingTokens[t.name];
        if (existing.value !== t.value) {
          existing.value = t.value;
          stats.tokensUpdated++;
        }
      } else {
        // New token
        tokenSet.addToken(penpotType, t.name, t.value);
        stats.tokensCreated++;
      }
    }
  }

  return stats;
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

return 'Token sync utilities initialized: storage.exportTokensDTCG, storage.importTokensDTCG, storage.generateStyleDictionaryConfig';
