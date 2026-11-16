#!/usr/bin/env node
// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Builds (or updates) a stick:  node tools/build.mjs /Volumes/CLAUDE [--platforms a,b] [--no-browser] [--force]
// Safe to re-run: existing vault.enc, projekte/ and the old Windows prototype files are never touched.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PLATFORMS, PLATFORMS } from '../src/config.mjs';
import { getClaudeRelease, getNodeRelease, installBrowser, installClaude, installMcp, installNode } from '../src/download.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--platforms');
if (!target) {
  console.error('Aufruf: node tools/build.mjs <Stick-Ordner> [--platforms darwin-arm64,win32-x64,linux-x64] [--no-browser] [--force]');
  process.exit(1);
}
const root = path.resolve(target);
const platforms = (value('--platforms') ?? DEFAULT_PLATFORMS.join(',')).split(',').map((s) => s.trim());
for (const p of platforms) {
  if (!PLATFORMS[p]) {
    console.error(`Unbekanntes System: ${p}. Möglich: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
}
if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Ordner nicht gefunden: ${root}`);
  process.exit(1);
}
const force = flag('--force');
const withBrowser = !flag('--no-browser');

const free = (await fsp.statfs(root)).bavail * (await fsp.statfs(root)).bsize;
if (free < 3 * 1024 ** 3) {
  console.error(`Zu wenig Platz auf ${root}: ${(free / 1024 ** 3).toFixed(1)} GB frei, mindestens 3 GB nötig.`);
  process.exit(1);
}

console.log(`Baue Stick nach ${root}`);
console.log(`Systeme: ${platforms.join(', ')}${withBrowser ? '' : ' (ohne Browser)'}\n`);

// 1. Our own files (small, always refreshed)
console.log('Programmdateien kopieren ...');
await fsp.mkdir(path.join(root, 'launcher'), { recursive: true });
for (const f of (await fsp.readdir(path.join(repo, 'src'))).filter((n) => n.endsWith('.mjs'))) {
  await fsp.copyFile(path.join(repo, 'src', f), path.join(root, 'launcher', f));
}
for (const f of await fsp.readdir(path.join(repo, 'start'))) {
  let data = await fsp.readFile(path.join(repo, 'start', f));
  if (f.endsWith('.bat')) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n')); // cmd.exe needs CRLF
  await fsp.writeFile(path.join(root, f), data);
  await fsp.chmod(path.join(root, f), 0o755).catch(() => {});
}
await fsp.mkdir(path.join(root, 'projekte'), { recursive: true });

// 2. Downloads (every file checked against the publisher's checksum)
console.log('\nVersionen abfragen ...');
const claude = await getClaudeRelease();
const node = await getNodeRelease();
console.log(`  Claude Code ${claude.version}, Node.js ${node.version}\n`);

if (withBrowser) {
  console.log('Playwright-MCP ...');
  if (force || !fs.existsSync(path.join(root, 'mcp', 'node_modules'))) await installMcp(root, path.join(repo, 'mcp'));
  else console.log('  schon vorhanden');
}

for (const key of platforms) {
  console.log(`\n${PLATFORMS[key].label} (${key})`);
  await installNode(root, key, node, { force });
  await installClaude(root, key, claude, { force });
  if (withBrowser) await installBrowser(root, key, { force });
}

await fsp.writeFile(
  path.join(root, 'stick.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), claude: claude.version, node: node.version, platforms }, null, 2),
);
console.log('\nFertig. Starten mit Start-Mac.command, Start-Windows.bat oder bash Start-Linux.sh');
