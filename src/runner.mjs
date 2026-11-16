// Starts Claude Code with the stick's settings and prepares the optional browser.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractArchive } from './download.mjs';

/** Finds the Chromium program inside an unpacked Playwright browsers folder. */
export function findChromium(dir, platform = process.platform) {
  let revs;
  try {
    revs = fs.readdirSync(dir).filter((n) => /^chromium-\d+/.test(n)).sort().reverse();
  } catch {
    return null;
  }
  for (const rev of revs) {
    const base = path.join(dir, rev);
    if (platform === 'darwin') {
      for (const sub of fs.readdirSync(base).filter((n) => n.startsWith('chrome-mac'))) {
        for (const app of fs.readdirSync(path.join(base, sub)).filter((n) => n.endsWith('.app'))) {
          const macos = path.join(base, sub, app, 'Contents', 'MacOS');
          if (!fs.existsSync(macos)) continue;
          const files = fs.readdirSync(macos);
          const name = files.find((f) => f === app.replace(/\.app$/, '')) ?? files[0];
          if (name) return path.join(macos, name);
        }
      }
    } else {
      const candidates = platform === 'win32' ? [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe']] : [['chrome-linux64', 'chrome'], ['chrome-linux', 'chrome']];
      for (const [sub, exe] of candidates) {
        const file = path.join(base, sub, exe);
        if (fs.existsSync(file)) return file;
      }
    }
  }
  return null;
}

/** Unpacks the stored browser into workDir/browser and returns the program path (or null). */
export async function prepareBrowser(archive, workDir) {
  if (!fs.existsSync(archive)) return null;
  const dir = path.join(workDir, 'browser');
  const existing = findChromium(dir);
  if (existing) return existing;
  await extractArchive(archive, dir);
  return findChromium(dir);
}

/** MCP config that lets Claude drive the stick's own Chromium. Isolated = no traces on the host. */
export function mcpConfig({ nodePath, mcpCli, chromiumPath }) {
  return {
    mcpServers: {
      browser: {
        command: nodePath,
        args: [mcpCli, '--browser', 'chromium', '--executable-path', chromiumPath, '--isolated'],
      },
    },
  };
}

export function claudeEnv({ base = process.env, dataDir, tokenVars = {} }) {
  return {
    ...base,
    CLAUDE_CONFIG_DIR: dataDir,
    // Updates go through the stick's own update entry, never into the host's user profile.
    DISABLE_AUTOUPDATER: '1',
    ...tokenVars,
  };
}

function spawnAndWait(bin, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', ...opts });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

/**
 * Runs Claude and waits. If the stick is mounted without permission to run programs
 * (some Linux systems), the program is copied to copyDir once and started from there.
 */
export async function runClaude({ bin, args = [], cwd, env, copyDir }) {
  try {
    return await spawnAndWait(bin, args, { cwd, env });
  } catch (err) {
    if (!['EACCES', 'EPERM'].includes(err.code) || !copyDir) throw err;
    await fsp.mkdir(copyDir, { recursive: true });
    const copy = path.join(copyDir, path.basename(bin));
    await fsp.copyFile(bin, copy);
    await fsp.chmod(copy, 0o755);
    return spawnAndWait(copy, args, { cwd, env });
  }
}
