// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { detectPlatform, paths, PLATFORMS } from '../src/config.mjs';
import { classifyToken, tokenEnv, loadSettings, saveSettings, saveToken, loadToken, DEFAULT_SETTINGS } from '../src/state.mjs';
import { backupVault } from '../src/backup.mjs';
import { copyrightLine } from '../src/copyright.mjs';
import { applyKey, tokenize, parseKey, moveIndex, renderItems } from '../src/ui.mjs';
import { downloadVerified } from '../src/download.mjs';
import { findChromium, mcpConfig, claudeEnv, runClaude } from '../src/runner.mjs';

const tmp = () => fsp.mkdtemp(path.join(os.tmpdir(), 'stick-unit-'));

test('platform detection maps every supported system, Windows on ARM uses x64', () => {
  assert.equal(detectPlatform('darwin', 'arm64'), 'darwin-arm64');
  assert.equal(detectPlatform('darwin', 'x64'), 'darwin-x64');
  assert.equal(detectPlatform('linux', 'x64'), 'linux-x64');
  assert.equal(detectPlatform('linux', 'arm64'), 'linux-arm64');
  assert.equal(detectPlatform('win32', 'x64'), 'win32-x64');
  assert.equal(detectPlatform('win32', 'arm64'), 'win32-x64');
  assert.throws(() => detectPlatform('freebsd', 'x64'));
});

test('paths put programs in per-system folders and add .exe only on Windows', () => {
  assert.equal(paths('/s', 'darwin-arm64').claude, path.join('/s', 'bin', 'darwin-arm64', 'claude'));
  assert.equal(paths('/s', 'win32-x64').claude, path.join('/s', 'bin', 'win32-x64', 'claude.exe'));
  assert.equal(paths('/s', 'win32-x64').node, path.join('/s', 'runtime', 'win32-x64', 'node.exe'));
  for (const key of Object.keys(PLATFORMS)) assert.ok(PLATFORMS[key].pw && PLATFORMS[key].claude && PLATFORMS[key].node);
});

test('login keys are recognised and mapped to the right variable', () => {
  const oauth = 'sk-ant-oat01-abcdefghijklmnop';
  const api = 'sk-ant-api03-abcdefghijklmnop';
  assert.equal(classifyToken(oauth).kind, 'oauth');
  assert.equal(classifyToken(`  ${api}\n`).kind, 'api');
  assert.equal(classifyToken('hello'), null);
  assert.equal(classifyToken('sk-ant-oat01-x y'), null);
  assert.deepEqual(tokenEnv(oauth), { CLAUDE_CODE_OAUTH_TOKEN: oauth });
  assert.deepEqual(tokenEnv(api), { ANTHROPIC_API_KEY: api });
  assert.deepEqual(tokenEnv(null), {});
});

test('a key pasted across two lines is joined, a password keeps its spaces', () => {
  const feed = (text, paste) => {
    const s = { buf: '' };
    const actions = [];
    for (const ch of text) actions.push(applyKey(s, ch, paste));
    return { buf: s.buf, actions };
  };
  assert.equal(feed('sk-ant-oat01-AAAA\r\n  BBBB\r', true).buf, 'sk-ant-oat01-AAAABBBB');
  assert.equal(feed('a b c', false).buf, 'a b c');
  assert.equal(feed('abc\u007f\u007fx', false).buf, 'ax');
  assert.ok(feed('x\r', false).actions.includes('enter'));
  assert.ok(feed('\u0003', false).actions.includes('cancel'));
});

test('arrow keys, Enter, Esc and typed keys are told apart', () => {
  assert.deepEqual(tokenize('\x1b[B\x1b[B\r'), ['\x1b[B', '\x1b[B', '\r']);
  assert.deepEqual(tokenize('3\r'), ['3', '\r']);
  assert.equal(parseKey('\x1b[A').name, 'up');
  assert.equal(parseKey('\x1bOB').name, 'down');
  assert.equal(parseKey('\r').name, 'enter');
  assert.equal(parseKey('\x1b').name, 'esc');
  assert.equal(parseKey('\u0003').name, 'cancel');
  assert.deepEqual(parseKey('n'), { name: 'char', char: 'n' });
  assert.equal(parseKey(' ').name, 'none');
});

test('the highlight wraps around at both ends', () => {
  assert.equal(moveIndex(0, -1, 4), 3);
  assert.equal(moveIndex(3, 1, 4), 0);
  assert.equal(moveIndex(1, 1, 4), 2);
});

test('the menu marks exactly the picked line and keeps hints and gaps', () => {
  const items = [
    { key: '1', label: 'Eins', hint: 'Tipp' },
    { key: '2', label: 'Zwei' },
    { key: '0', label: 'Zurück', gapBefore: true },
  ];
  const lines = renderItems(items, 1, 40);
  assert.equal(lines.length, 4); // 3 items + 1 gap line
  assert.equal(lines.filter((l) => l.includes('>')).length, 1);
  assert.ok(lines.find((l) => l.includes('>')).includes('Zwei'));
  assert.ok(lines[0].includes('Tipp'));
  assert.equal(lines[2], '');
  assert.equal(renderItems(items, -1, 40).some((l) => l.includes('>')), false);
});

test('the copyright line shows one year in 2026 and a range afterwards', () => {
  assert.equal(copyrightLine(2026), '© 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang');
  assert.equal(copyrightLine(2028), '© 2026–2028 >devcircus_ · www.dev-circus.com · by Patrick B. Stang');
  assert.ok(!copyrightLine().includes('@'), 'no e-mail address in the line');
});

test('settings and token round trip, missing files give defaults', async () => {
  const dir = await tmp();
  assert.deepEqual(await loadSettings(dir), DEFAULT_SETTINGS);
  assert.equal(await loadToken(dir), null);
  await saveSettings(dir, { ...DEFAULT_SETTINGS, browser: true });
  await saveToken(dir, ' sk-ant-oat01-abcdefghijklmnop \n');
  assert.equal((await loadSettings(dir)).browser, true);
  assert.equal(await loadToken(dir), 'sk-ant-oat01-abcdefghijklmnop');
});

test('backup keeps only the newest copies', async () => {
  const dir = await tmp();
  const vault = path.join(dir, 'vault.enc');
  await fsp.writeFile(vault, 'data');
  const out = path.join(dir, 'backups');
  for (let i = 0; i < 5; i++) {
    await backupVault(vault, out, { keep: 3, now: new Date(2026, 0, 1, 10, 0, i) });
  }
  const files = (await fsp.readdir(out)).sort();
  assert.equal(files.length, 3);
  assert.match(files[0], /20260101-100002/);
  assert.match(files[2], /20260101-100004/);
});

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('download accepts a matching checksum and rejects a wrong one without leaving files', async () => {
  const body = crypto.randomBytes(200_000);
  const good = crypto.createHash('sha256').update(body).digest('hex');
  await withServer((req, res) => res.end(body), async (base) => {
    const dir = await tmp();
    await downloadVerified(`${base}/f`, path.join(dir, 'ok.bin'), { sha256: good });
    assert.deepEqual(await fsp.readFile(path.join(dir, 'ok.bin')), body);

    await assert.rejects(downloadVerified(`${base}/f`, path.join(dir, 'bad.bin'), { sha256: 'a'.repeat(64) }), /Prüfsumme/);
    assert.equal(fs.existsSync(path.join(dir, 'bad.bin')), false);
    assert.equal(fs.existsSync(path.join(dir, 'bad.bin.part')), false);
  });
});

test('download fails cleanly on an HTTP error', async () => {
  await withServer((req, res) => { res.statusCode = 404; res.end(); }, async (base) => {
    const dir = await tmp();
    await assert.rejects(downloadVerified(`${base}/x`, path.join(dir, 'x'), {}), /404/);
  });
});

async function fakeBrowser(dir, sub, ...file) {
  const f = path.join(dir, 'chromium-1234', sub, ...file);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, '');
  return f;
}

test('findChromium locates the program on each system layout', async () => {
  const mac = await tmp();
  const macExe = await fakeBrowser(mac, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
  assert.equal(findChromium(mac, 'darwin'), macExe);

  const win = await tmp();
  const winExe = await fakeBrowser(win, 'chrome-win64', 'chrome.exe');
  assert.equal(findChromium(win, 'win32'), winExe);

  const lin = await tmp();
  const linExe = await fakeBrowser(lin, 'chrome-linux64', 'chrome');
  assert.equal(findChromium(lin, 'linux'), linExe);

  assert.equal(findChromium(await tmp(), 'linux'), null);
  assert.equal(findChromium('/does/not/exist', 'linux'), null);
});

test('browser config is isolated and points at the stick programs', () => {
  const cfg = mcpConfig({ nodePath: '/s/node', mcpCli: '/s/cli.js', chromiumPath: '/t/chrome' });
  const s = cfg.mcpServers.browser;
  assert.equal(s.command, '/s/node');
  assert.ok(s.args.includes('--isolated'));
  assert.equal(s.args[s.args.indexOf('--executable-path') + 1], '/t/chrome');
});

test('Claude gets its own config folder and no auto-updater', () => {
  const env = claudeEnv({ base: { PATH: 'x' }, dataDir: '/d', tokenVars: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(env.CLAUDE_CONFIG_DIR, '/d');
  assert.equal(env.DISABLE_AUTOUPDATER, '1');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 't');
  assert.equal(env.PATH, 'x');
});

test('runClaude returns the exit code of the program', async () => {
  const r = await runClaude({ bin: process.execPath, args: ['-e', 'process.exit(7)'], cwd: os.tmpdir(), env: process.env });
  assert.equal(r.code, 7);
});
