// Downloads with checksum verification, used by the build tool and the "update" menu entry.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CLAUDE_BASE, NODE_BASE, PLATFORMS, paths } from './config.mjs';

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  return res.text();
}

export async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

/** Streams url to dest, checks the SHA-256 and only then moves it into place. */
export async function downloadVerified(url, dest, { sha256, onProgress } = {}) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  let got = 0;
  const part = `${dest}.part`;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await pipeline(
      Readable.fromWeb(res.body),
      new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          got += chunk.length;
          onProgress?.(got, total);
          cb(null, chunk);
        },
      }),
      fs.createWriteStream(part),
    );
    const actual = hash.digest('hex');
    if (sha256 && actual !== sha256.toLowerCase()) {
      throw new Error(`Prüfsumme stimmt nicht, Datei verworfen: ${path.basename(dest)}`);
    }
    await fsp.rename(part, dest);
    return actual;
  } catch (err) {
    await fsp.rm(part, { force: true });
    throw err;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} endete mit Code ${code}\n${out.slice(-2000)}`)),
    );
  });
}

export async function extractArchive(archive, dir) {
  await fsp.mkdir(dir, { recursive: true });
  // bsdtar (macOS, Windows 10+) reads zip, tar.gz and tar.xz; GNU tar needs unzip for zip.
  if (archive.endsWith('.zip') && process.platform === 'linux') {
    await run('unzip', ['-q', archive, '-d', dir]);
  } else {
    await run('tar', ['-xf', archive, '-C', dir]);
  }
}

export function progressPrinter(label) {
  let last = 0;
  return (got, total) => {
    const now = Date.now();
    if (now - last < 250 && got !== total) return;
    last = now;
    const mb = (got / 1048576).toFixed(0);
    const pct = total ? ` ${Math.round((got / total) * 100)}%` : '';
    process.stdout.write(`\r  ${label}: ${mb} MB${pct}   `);
  };
}

// --- Claude Code -----------------------------------------------------------------

export async function getClaudeRelease(base = CLAUDE_BASE) {
  const version = (await fetchText(`${base}/latest`)).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Unerwartete Versionsangabe: ${version}`);
  const manifest = await fetchJson(`${base}/${version}/manifest.json`);
  return { base, version, manifest };
}

async function readVersion(file) {
  try {
    return (await fsp.readFile(file, 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function installedClaudeVersion(root, key) {
  return readVersion(paths(root, key).claudeVersion);
}

export async function installClaude(root, key, release, { force = false, log = console.log } = {}) {
  const p = PLATFORMS[key];
  const target = paths(root, key);
  if (!force && (await readVersion(target.claudeVersion)) === release.version && fs.existsSync(target.claude)) {
    log(`  Claude Code ${release.version} (${p.label}): schon aktuell`);
    return false;
  }
  const entry = release.manifest.platforms?.[p.claude];
  if (!entry?.checksum) throw new Error(`Keine Prüfsumme für ${p.claude} im Manifest`);
  const url = `${release.base}/${release.version}/${p.claude}/claude${p.exe}`;
  await downloadVerified(url, target.claude, { sha256: entry.checksum, onProgress: progressPrinter(`Claude Code ${p.label}`) });
  await fsp.chmod(target.claude, 0o755).catch(() => {});
  await fsp.writeFile(target.claudeVersion, `${release.version}\n`);
  process.stdout.write('\n');
  log(`  Claude Code ${release.version} (${p.label}): fertig, Prüfsumme stimmt`);
  return true;
}

// --- Node.js ---------------------------------------------------------------------

export async function getNodeRelease(base = NODE_BASE) {
  const index = await fetchJson(`${base}/index.json`);
  const lts = index.find((r) => r.lts);
  if (!lts) throw new Error('Keine Node.js-LTS-Version gefunden');
  const sums = new Map();
  for (const line of (await fetchText(`${base}/${lts.version}/SHASUMS256.txt`)).split('\n')) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+(\S+)$/);
    if (m) sums.set(m[2], m[1]);
  }
  return { base, version: lts.version, sums };
}

export async function installNode(root, key, release, { force = false, log = console.log } = {}) {
  const p = PLATFORMS[key];
  const target = paths(root, key);
  if (!force && (await readVersion(target.nodeVersion)) === release.version && fs.existsSync(target.node)) {
    log(`  Node.js ${release.version} (${p.label}): schon aktuell`);
    return false;
  }
  const name = `node-${release.version}-${p.node}.${p.nodeExt}`;
  const sha = release.sums.get(name);
  if (!sha) throw new Error(`Keine Prüfsumme für ${name}`);
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'stick-node-'));
  try {
    const archive = path.join(work, name);
    await downloadVerified(`${release.base}/${release.version}/${name}`, archive, { sha256: sha, onProgress: progressPrinter(`Node.js ${p.label}`) });
    process.stdout.write('\n');
    const out = path.join(work, 'x');
    await extractArchive(archive, out);
    const folder = `node-${release.version}-${p.node}`;
    const src = p.exe ? path.join(out, folder, `node${p.exe}`) : path.join(out, folder, 'bin', 'node');
    await fsp.mkdir(path.dirname(target.node), { recursive: true });
    await fsp.copyFile(src, target.node);
    await fsp.chmod(target.node, 0o755).catch(() => {});
    await fsp.writeFile(target.nodeVersion, `${release.version}\n`);
    log(`  Node.js ${release.version} (${p.label}): fertig, Prüfsumme stimmt`);
    return true;
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

// --- Playwright MCP and Chromium ----------------------------------------------------

/** Installs the pinned @playwright/mcp (see mcp/package-lock.json) into root/mcp. */
export async function installMcp(root, repoMcpDir, { log = console.log } = {}) {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'stick-mcp-'));
  try {
    for (const f of ['package.json', 'package-lock.json']) await fsp.copyFile(path.join(repoMcpDir, f), path.join(work, f));
    // exFAT cannot hold symlinks, so no .bin links; files are copied with links resolved.
    await run('npm', ['ci', '--no-bin-links', '--no-audit', '--no-fund', '--omit=dev'], { cwd: work, shell: process.platform === 'win32' });
    const dest = path.join(root, 'mcp');
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(dest, { recursive: true });
    await fsp.cp(path.join(work, 'node_modules'), path.join(dest, 'node_modules'), { recursive: true, dereference: true });
    for (const f of ['package.json', 'package-lock.json']) await fsp.copyFile(path.join(work, f), path.join(dest, f));
    log('  Playwright-MCP: fertig');
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

/**
 * Downloads Chromium for the target system (even from another system) and stores it as one
 * tar.gz. On the stick it stays a single file, so symlinks inside Chromium.app survive
 * exFAT; the menu unpacks it into a temp folder when the browser is switched on.
 */
export async function installBrowser(root, key, { force = false, log = console.log } = {}) {
  const p = PLATFORMS[key];
  const target = paths(root, key);
  if (!force && fs.existsSync(target.browserArchive)) {
    log(`  Browser (${p.label}): schon vorhanden`);
    return false;
  }
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'stick-browser-'));
  try {
    const cli = path.join(paths(root, key).mcpDir, 'node_modules', 'playwright-core', 'cli.js');
    const browsers = path.join(work, 'browsers');
    log(`  Browser (${p.label}): Chromium wird geladen ...`);
    await run(process.execPath, [cli, 'install', 'chromium', '--no-shell', '--no-remove'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: p.pw },
    });
    await fsp.mkdir(path.dirname(target.browserArchive), { recursive: true });
    const tmpOut = `${target.browserArchive}.part`;
    await run('tar', ['-czf', tmpOut, '-C', browsers, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    await fsp.rename(tmpOut, target.browserArchive);
    log(`  Browser (${p.label}): fertig`);
    return true;
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}
