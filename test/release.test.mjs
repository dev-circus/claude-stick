// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { downloadVerified, installMcp } from '../src/download.mjs';
import { stageFiles } from '../tools/stage.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const tmp = () => fsp.mkdtemp(path.join(os.tmpdir(), 'stick-rel-'));

test('the download folder holds exactly the files a first start needs', async () => {
  const dest = await tmp();
  await stageFiles(repo, dest, { nodeVersion: 'v99.1.2' });
  for (const f of [
    'Start-Mac.command',
    'Start-Linux.sh',
    'Start-Windows.bat',
    'ANLEITUNG.txt',
    'LICENSE',
    'launcher/menu.mjs',
    'launcher/setup.mjs',
    'launcher/copyright.mjs',
    'launcher/get-node.ps1',
    'mcp/package.json',
    'mcp/package-lock.json',
  ]) {
    assert.ok(fs.existsSync(path.join(dest, f)), `missing ${f}`);
  }
  assert.equal(await fsp.readFile(path.join(dest, 'launcher', 'NODE_VERSION'), 'utf8'), 'v99.1.2\n');
  for (const f of ['vault.enc', 'runtime', 'bin', 'browser', 'node_modules', '.git']) {
    assert.equal(fs.existsSync(path.join(dest, f)), false, `${f} must not be in the download`);
  }
});

test('Windows files get Windows line endings, scripts stay executable', async () => {
  const dest = await tmp();
  await stageFiles(repo, dest, { nodeVersion: 'v1.0.0' });
  for (const f of ['Start-Windows.bat', 'ANLEITUNG.txt', 'launcher/get-node.ps1']) {
    const text = await fsp.readFile(path.join(dest, f), 'utf8');
    assert.ok(text.includes('\r\n'), `${f} should use CRLF`);
    assert.equal(/[^\r]\n/.test(text), false, `${f} has a bare LF`);
  }
  const sh = await fsp.readFile(path.join(dest, 'Start-Linux.sh'), 'utf8');
  assert.equal(sh.includes('\r'), false);
  if (process.platform !== 'win32') {
    for (const f of ['Start-Mac.command', 'Start-Linux.sh']) {
      assert.ok((await fsp.stat(path.join(dest, f))).mode & 0o100, `${f} must be executable`);
    }
  }
});

test('the Windows setup script stays plain ASCII so PowerShell 5.1 reads it right', async () => {
  const bytes = await fsp.readFile(path.join(repo, 'start', 'get-node.ps1'));
  assert.equal(bytes.some((b) => b > 127), false);
});

test('no start file carries an e-mail address or a real key', async () => {
  const dest = await tmp();
  await stageFiles(repo, dest, { nodeVersion: 'v1.0.0' });
  for (const f of ['Start-Mac.command', 'Start-Linux.sh', 'Start-Windows.bat', 'ANLEITUNG.txt', 'launcher/get-node.ps1']) {
    const text = await fsp.readFile(path.join(dest, f), 'utf8');
    assert.equal(/\S+@\S+\.\S+/.test(text), false, `${f} contains an address`);
    assert.equal(/sk-ant-/.test(text), false, `${f} contains a key`);
  }
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

test('downloads can be checked with an npm-style integrity hash', async () => {
  const body = crypto.randomBytes(50_000);
  const good = `sha512-${crypto.createHash('sha512').update(body).digest('base64')}`;
  await withServer((req, res) => res.end(body), async (base) => {
    const dir = await tmp();
    await downloadVerified(`${base}/f`, path.join(dir, 'ok'), { integrity: good });
    assert.deepEqual(await fsp.readFile(path.join(dir, 'ok')), body);
    await assert.rejects(downloadVerified(`${base}/f`, path.join(dir, 'bad'), { integrity: `sha512-${'A'.repeat(86)}==` }), /Prüfsumme/);
    assert.equal(fs.existsSync(path.join(dir, 'bad')), false);
    await assert.rejects(downloadVerified(`${base}/f`, path.join(dir, 'odd'), { integrity: 'md5-xyz' }), /Prüfsummenformat/);
  });
});

function makePackage(files) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'stick-pkg-'));
  const pkg = path.join(work, 'package');
  fs.mkdirSync(pkg);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(pkg, name), content);
  const out = path.join(work, 'p.tgz');
  const r = spawnSync('tar', ['-czf', out, '-C', work, 'package']);
  assert.equal(r.status, 0, String(r.stderr));
  const buf = fs.readFileSync(out);
  return { buf, integrity: `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}` };
}

test('the browser tool installs from the lockfile without npm and rejects a wrong hash', async () => {
  const foo = makePackage({ 'index.js': 'module.exports = "foo";', 'package.json': '{"name":"foo"}' });
  const bar = makePackage({ 'index.js': 'module.exports = "bar";' });
  const routes = { '/foo.tgz': foo.buf, '/bar.tgz': bar.buf };

  await withServer((req, res) => (routes[req.url] ? res.end(routes[req.url]) : ((res.statusCode = 404), res.end())), async (base) => {
    const lockDir = await tmp();
    const lockFor = (barIntegrity) => ({
      lockfileVersion: 3,
      packages: {
        '': { name: 'x' },
        'node_modules/foo': { version: '1.0.0', resolved: `${base}/foo.tgz`, integrity: foo.integrity },
        'node_modules/@scope/bar': { version: '1.0.0', resolved: `${base}/bar.tgz`, integrity: barIntegrity },
        'node_modules/skipped-dev': { resolved: `${base}/nope.tgz`, integrity: foo.integrity, dev: true },
      },
    });
    await fsp.writeFile(path.join(lockDir, 'package.json'), '{"name":"x"}');
    await fsp.writeFile(path.join(lockDir, 'package-lock.json'), JSON.stringify(lockFor(bar.integrity)));

    const root = await tmp();
    const opts = { log: () => {}, allowedHosts: ['127.0.0.1'] };
    await installMcp(root, lockDir, opts);
    assert.equal(await fsp.readFile(path.join(root, 'mcp', 'node_modules', 'foo', 'index.js'), 'utf8'), 'module.exports = "foo";');
    assert.equal(await fsp.readFile(path.join(root, 'mcp', 'node_modules', '@scope', 'bar', 'index.js'), 'utf8'), 'module.exports = "bar";');
    assert.ok(fs.existsSync(path.join(root, 'mcp', 'package-lock.json')));
    assert.equal(fs.existsSync(path.join(root, 'mcp', 'node_modules', 'skipped-dev')), false);

    // A wrong hash must fail and leave the existing install untouched.
    await fsp.writeFile(path.join(lockDir, 'package-lock.json'), JSON.stringify(lockFor(`sha512-${'A'.repeat(86)}==`)));
    await assert.rejects(installMcp(root, lockDir, opts), /Prüfsumme/);
    assert.ok(fs.existsSync(path.join(root, 'mcp', 'node_modules', 'foo', 'index.js')));

    // Installing straight from the stick's own mcp folder (the first-start case) works too.
    await fsp.writeFile(path.join(root, 'mcp', 'package-lock.json'), JSON.stringify(lockFor(bar.integrity)));
    await fsp.rm(path.join(root, 'mcp', 'node_modules'), { recursive: true, force: true });
    await installMcp(root, path.join(root, 'mcp'), opts);
    assert.ok(fs.existsSync(path.join(root, 'mcp', 'node_modules', '@scope', 'bar', 'index.js')));
  });
});

test('the browser tool refuses unknown sources and paths that climb out', async () => {
  const lockDir = await tmp();
  const write = (packages) => fsp.writeFile(path.join(lockDir, 'package-lock.json'), JSON.stringify({ packages }));
  const root = await tmp();
  const integrity = `sha512-${'A'.repeat(86)}==`;

  await write({ 'node_modules/x': { resolved: 'https://evil.example/x.tgz', integrity } });
  await assert.rejects(installMcp(root, lockDir, { log: () => {} }), /Unerlaubte Quelle/);

  await write({ 'node_modules/../escape': { resolved: 'https://registry.npmjs.org/x.tgz', integrity } });
  await assert.rejects(installMcp(root, lockDir, { log: () => {} }), /Unzulässiger Pfad/);

  await write({ 'node_modules/y': { resolved: 'https://registry.npmjs.org/y.tgz' } });
  await assert.rejects(installMcp(root, lockDir, { log: () => {} }), /Keine Prüfsumme/);

  await write({});
  await assert.rejects(installMcp(root, lockDir, { log: () => {} }), /keine Pakete/);
});
