// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
import path from 'node:path';

// One entry per system the stick can carry. `exe` is the file extension of programs.
export const PLATFORMS = {
  'darwin-arm64': { label: 'macOS (Apple-Chip)', claude: 'darwin-arm64', node: 'darwin-arm64', nodeExt: 'tar.gz', pw: 'mac15-arm64', exe: '' },
  'darwin-x64': { label: 'macOS (Intel)', claude: 'darwin-x64', node: 'darwin-x64', nodeExt: 'tar.gz', pw: 'mac15', exe: '' },
  'win32-x64': { label: 'Windows', claude: 'win32-x64', node: 'win-x64', nodeExt: 'zip', pw: 'win64', exe: '.exe' },
  'linux-x64': { label: 'Linux (Intel/AMD)', claude: 'linux-x64', node: 'linux-x64', nodeExt: 'tar.xz', pw: 'ubuntu24.04-x64', exe: '' },
  'linux-arm64': { label: 'Linux (ARM)', claude: 'linux-arm64', node: 'linux-arm64', nodeExt: 'tar.xz', pw: 'ubuntu24.04-arm64', exe: '' },
};

export const DEFAULT_PLATFORMS = ['darwin-arm64', 'win32-x64', 'linux-x64'];

export const CLAUDE_BASE = 'https://downloads.claude.ai/claude-code-releases';
export const NODE_BASE = 'https://nodejs.org/dist';

/** Maps the running system to a stick platform. Windows on ARM runs the x64 build via emulation. */
export function detectPlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return 'win32-x64';
  const key = `${platform}-${arch}`;
  if (!PLATFORMS[key]) throw new Error(`Dieses System wird nicht unterstützt: ${platform}/${arch}`);
  return key;
}

export function paths(root, key) {
  const p = PLATFORMS[key];
  return {
    root,
    claude: path.join(root, 'bin', key, `claude${p.exe}`),
    claudeVersion: path.join(root, 'bin', key, 'VERSION'),
    node: path.join(root, 'runtime', key, `node${p.exe}`),
    nodeVersion: path.join(root, 'runtime', key, 'VERSION'),
    browserArchive: path.join(root, 'browser', `${key}.tar.gz`),
    mcpDir: path.join(root, 'mcp'),
    mcpCli: path.join(root, 'mcp', 'node_modules', '@playwright', 'mcp', 'cli.js'),
    vault: path.join(root, 'vault.enc'),
    projects: path.join(root, 'projekte'),
  };
}
