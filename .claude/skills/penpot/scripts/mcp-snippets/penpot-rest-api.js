// ============================================================
// Penpot REST API Utilities
// Read this file, then run via MCP execute_code.
//
// Provides: storage.api, storage.getProfile, storage.getTeamId,
//           storage.getProjects, storage.createProject,
//           storage.getProjectFiles, storage.createFile,
//           storage.setFileShared, storage.duplicateFile,
//           storage.getSharedLibraries, storage.getFileLibraries,
//           storage.linkLibrary, storage.unlinkLibrary,
//           storage.openFile, storage.waitForReconnect,
//           storage.getFile
// ============================================================

// ---------------------------------------------------------------------------
// タイムアウトヘルパー（プラグインコンテキストに AbortController がないため Promise.race）
// ---------------------------------------------------------------------------
storage._apiTimeout = 10000; // デフォルト 10秒

storage._withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`Timed out (${ms}ms)`)), ms)),
]);

// ---------------------------------------------------------------------------
// 汎用 RPC 呼び出し（Penpot REST API は全エンドポイント POST + JSON）
// ---------------------------------------------------------------------------
storage.api = async (command, params = {}, timeout) => {
  const ms = timeout || storage._apiTimeout;
  // mcp-connect ブリッジサーバー (port 3000) の /api-proxy 経由でブラウザ Cookie 認証付き REST API を呼び出す
  const doFetch = async () => {
    const res = await fetch('http://localhost:3000/api-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${command} failed: ${res.status} — ${text}`);
    }
    const text = await res.text();
    if (!text) return null; // 空レスポンス対応（delete-file 等）
    return JSON.parse(text);
  };
  return storage._withTimeout(doFetch(), ms);
};

// ---------------------------------------------------------------------------
// プロファイル・チーム
// ---------------------------------------------------------------------------
storage._cachedProfile = null;

storage.getProfile = async () => {
  if (storage._cachedProfile) return storage._cachedProfile;
  storage._cachedProfile = await storage.api('get-profile');
  return storage._cachedProfile;
};

storage.getTeamId = async () => {
  // Shared Workspace チームを優先、なければ Default チーム
  const teams = await storage.api('get-teams');
  const shared = teams.find(t => t.name === 'Shared Workspace');
  if (shared) return shared.id;
  const profile = await storage.getProfile();
  return profile.defaultTeamId || profile['default-team-id'];
};

// ---------------------------------------------------------------------------
// 現在接続中ファイルのプロジェクトID取得
// ---------------------------------------------------------------------------
storage.getCurrentProjectId = async () => {
  const fileId = penpot.currentFile?.id;
  if (!fileId) throw new Error('No file currently open');
  const teamId = await storage.getTeamId();
  const projects = await storage.api('get-projects', { teamId });
  for (const p of projects) {
    const files = await storage.api('get-project-files', { projectId: p.id });
    if (files.some(f => f.id === fileId)) return p.id;
  }
  throw new Error(`Current file ${fileId} not found in any project`);
};

// ---------------------------------------------------------------------------
// プロジェクト
// ---------------------------------------------------------------------------
storage.getProjects = async () => {
  const teamId = await storage.getTeamId();
  return storage.api('get-projects', { teamId });
};

storage.createProject = async (name) => {
  const teamId = await storage.getTeamId();
  return storage.api('create-project', { teamId, name });
};

// ---------------------------------------------------------------------------
// ファイル
// ---------------------------------------------------------------------------
storage.getProjectFiles = async (projectId) => {
  return storage.api('get-project-files', { projectId });
};

storage.createFile = async (projectId, name, opts = {}) => {
  const file = await storage.api('create-file', { projectId, name });
  if (opts.isShared) {
    await storage.setFileShared(file.id, true);
  }
  return file;
};

storage.setFileShared = async (fileId, isShared) => {
  return storage.api('set-file-shared', { id: fileId, isShared });
};

storage.duplicateFile = async (fileId, name) => {
  const params = { fileId };
  if (name) params.name = name;
  return storage.api('duplicate-file', params);
};

// ---------------------------------------------------------------------------
// ライブラリ（Shared Libraries）
// ---------------------------------------------------------------------------
storage.getSharedLibraries = async () => {
  const teamId = await storage.getTeamId();
  return storage.api('get-team-shared-files', { teamId });
};

storage.getFileLibraries = async (fileId) => {
  return storage.api('get-file-libraries', { fileId });
};

storage.linkLibrary = async (fileId, libraryId) => {
  return storage.api('link-file-to-library', { fileId, libraryId });
};

storage.unlinkLibrary = async (fileId, libraryId) => {
  return storage.api('unlink-file-from-library', { fileId, libraryId });
};

// ---------------------------------------------------------------------------
// ファイル切り替え（mcp-connect ブリッジサーバー経由の Playwright ナビゲーション）
// ---------------------------------------------------------------------------
storage.openFile = async (projectId, fileId) => {
  const res = await fetch('http://localhost:3000/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, fileId }),
  });
  if (!res.ok) throw new Error(`Navigate failed: ${res.status}`);
  return res.json();
  // 注意: この関数の戻り後、MCP 接続は一時切断される
  // 再接続は mcp-connect が自動で行う（10-15秒）
  // 再接続後、penpot-init.js と penpot-rest-api.js の再初期化が必要
};

storage.waitForReconnect = async (timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://localhost:3000/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ready') return data;
        if (data.status === 'error') throw new Error('Navigation/reconnect failed');
      }
    } catch (e) {
      if (e.message === 'Navigation/reconnect failed') throw e;
      // fetch error — server not reachable, retry
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timeout waiting for MCP reconnect');
};

// ---------------------------------------------------------------------------
// ファイル情報取得
// ---------------------------------------------------------------------------
storage.getFile = async (fileId) => {
  return storage.api('get-file', { id: fileId });
};

// ---------------------------------------------------------------------------
// UUID 生成ヘルパー
// ---------------------------------------------------------------------------
storage._uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

