#!/usr/bin/env node
// Penpot REST API helper — replaces host-side curl usage in penpot-manage.sh
// Requires Node.js v20+ (for built-in fetch and getSetCookie)

class PenpotClient {
  #uri;
  #cookies = '';

  constructor(uri) {
    this.#uri = uri.replace(/\/+$/, '');
  }

  async login(email, password) {
    const r = await fetch(`${this.#uri}/api/rpc/command/login-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    });
    this.#cookies = (r.headers.getSetCookie?.() ?? []).join('; ');
    return r.ok || r.status === 302;
  }

  async #req(method, path, body) {
    const opts = {
      method,
      headers: {
        'Accept': 'application/json',
        'Cookie': this.#cookies,
      },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(`${this.#uri}${path}`, opts);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`${method} ${path} → ${r.status}: ${text}`);
    }
    return r.json();
  }

  getTeams() {
    return this.#req('GET', '/api/rpc/command/get-teams');
  }

  getProjects(teamId) {
    return this.#req('GET', `/api/rpc/command/get-projects?team-id=${teamId}`);
  }

  createTeam(name) {
    return this.#req('POST', '/api/rpc/command/create-team', { name });
  }

  createProject(teamId, name) {
    return this.#req('POST', '/api/rpc/command/create-project', { teamId, name });
  }

  createFile(projectId, name) {
    return this.#req('POST', '/api/rpc/command/create-file', { projectId, name });
  }

  getProjectFiles(projectId) {
    return this.#req('GET', `/api/rpc/command/get-project-files?project-id=${projectId}`);
  }

  getCommentThreads(fileId) {
    return this.#req('GET', `/api/rpc/command/get-comment-threads?file-id=${fileId}`);
  }

  /**
   * Resolve team -> project -> file ID automatically (same logic as mcp-connect.mjs ensureWorkspaceFile).
   * Returns the first file ID found in the workspace.
   */
  async getWorkspaceFileId(teamName) {
    const teams = await this.getTeams();
    const team = teams.find(t => t.name === teamName)
      || teams.find(t => t.isDefault || t['is-default'])
      || teams[0];
    if (!team) throw new Error('No team found');

    const projects = await this.getProjects(team.id);
    const project = projects.find(p => p.isDefault || p['is-default']) || projects[0];
    if (!project) throw new Error('No project found');

    const files = await this.getProjectFiles(project.id);
    if (!files.length) throw new Error('No files found in project');
    return files[0].id;
  }
}

// --- CLI ---

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[++i] ?? '';
    } else {
      positional.push(argv[i]);
    }
  }
  return { command: positional[0], args };
}

function required(args, ...keys) {
  for (const k of keys) {
    if (!args[k]) {
      throw new Error(`Missing required option: --${k}`);
    }
  }
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));

  if (!command) {
    console.error('Usage: penpot-api.mjs <command> --uri <uri> --email <email> --password <password> [options]');
    console.error('Commands: create-team, setup-workspace, get-comment-threads');
    process.exit(1);
  }

  required(args, 'uri', 'email', 'password');

  const client = new PenpotClient(args.uri);
  const ok = await client.login(args.email, args.password);
  if (!ok) throw new Error('Login failed');

  switch (command) {
    case 'create-team': {
      required(args, 'name');
      const team = await client.createTeam(args.name);
      process.stdout.write(team.id);
      break;
    }

    case 'setup-workspace': {
      required(args, 'team-name');
      const teamName = args['team-name'];

      // Find target team (prefer shared team, fall back to default)
      const teams = await client.getTeams();
      const team = teams.find(t => t.name === teamName)
        || teams.find(t => t.isDefault || t['is-default'])
        || teams[0];
      if (!team) throw new Error('No team found');

      // Find or create project
      const projects = await client.getProjects(team.id);
      let project = projects.find(p => p.isDefault || p['is-default']) || projects[0];
      if (!project) {
        project = await client.createProject(team.id, 'MCP Workspace');
      }

      // Create file
      const file = await client.createFile(project.id, 'MCP Workspace');

      process.stdout.write(file.id);
      break;
    }

    case 'get-comment-threads': {
      const teamName = args['team-name'] || 'Shared Workspace';
      const fileId = args['file-id'] || await client.getWorkspaceFileId(teamName);
      const threads = await client.getCommentThreads(fileId);

      if (args.format === 'pretty') {
        const unresolved = threads.filter(t => !t.isResolved);
        if (unresolved.length === 0) {
          console.log('No unresolved comments.');
          break;
        }

        // Group by page
        const byPage = {};
        for (const t of unresolved) {
          const page = t.pageName || t.pageId || 'Unknown';
          (byPage[page] ??= []).push(t);
        }

        const fileName = unresolved[0]?.fileName || 'Unknown';
        console.log(`=== Comments: ${fileName} (${unresolved.length} unresolved) ===`);
        console.log('');

        for (const [page, pageThreads] of Object.entries(byPage)) {
          console.log(`Page: ${page}`);
          for (const t of pageThreads) {
            const date = t.createdAt ? t.createdAt.slice(0, 10) : '';
            const owner = t.ownerFullname || t.ownerEmail || 'Unknown';
            console.log(`  #${t.seqn} [OPEN] by ${owner} (${date})`);
            console.log(`     "${t.content}"`);
          }
          console.log('');
        }
      } else {
        process.stdout.write(JSON.stringify(threads, null, 2));
      }
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
