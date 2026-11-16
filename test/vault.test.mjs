// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newSession, sealDir, unsealToDir, safeJoin, VaultError } from '../src/vault.mjs';

const LOG_N = 12; // fast for tests; production uses 17

async function tmp() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'stick-test-'));
}

async function makeTree(root) {
  await fsp.mkdir(path.join(root, 'a', 'b'), { recursive: true });
  await fsp.writeFile(path.join(root, 'token'), 'sk-test-123');
  await fsp.writeFile(path.join(root, 'empty'), '');
  await fsp.writeFile(path.join(root, 'a', 'b', 'Übung ß.txt'), 'umlaute ok');
  await fsp.writeFile(path.join(root, 'big.bin'), crypto.randomBytes(3 * 1024 * 1024 + 7));
}

async function readTree(root, rel = '') {
  const out = {};
  for (const e of await fsp.readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await readTree(root, r));
    else out[r] = crypto.createHash('sha256').update(await fsp.readFile(path.join(root, r))).digest('hex');
  }
  return out;
}

test('round trip keeps every file byte for byte', async () => {
  const src = await tmp();
  const dst = path.join(await tmp(), 'out');
  const vault = path.join(await tmp(), 'vault.enc');
  await makeTree(src);
  const session = await newSession('correct horse', { logN: LOG_N });
  await sealDir(src, vault, session);
  await unsealToDir(vault, 'correct horse', dst);
  assert.deepEqual(await readTree(dst), await readTree(src));
});

test('wrong password is rejected before anything is written', async () => {
  const src = await tmp();
  const dst = path.join(await tmp(), 'out');
  const vault = path.join(await tmp(), 'vault.enc');
  await makeTree(src);
  await sealDir(src, vault, await newSession('right', { logN: LOG_N }));
  await assert.rejects(unsealToDir(vault, 'wrong', dst), { code: 'WRONG_PASSWORD' });
  assert.equal(fs.existsSync(dst), false);
});

test('a changed byte in the data is detected and the target is wiped', async () => {
  const src = await tmp();
  const dst = path.join(await tmp(), 'out');
  const vault = path.join(await tmp(), 'vault.enc');
  await makeTree(src);
  await sealDir(src, vault, await newSession('pw', { logN: LOG_N }));
  const raw = await fsp.readFile(vault);
  raw[Math.floor(raw.length / 2)] ^= 0xff;
  await fsp.writeFile(vault, raw);
  await assert.rejects(unsealToDir(vault, 'pw', dst), { code: 'CORRUPT' });
  assert.equal(fs.existsSync(dst), false);
});

test('a changed header is rejected', async () => {
  const src = await tmp();
  const vault = path.join(await tmp(), 'vault.enc');
  await makeTree(src);
  await sealDir(src, vault, await newSession('pw', { logN: LOG_N }));
  const raw = await fsp.readFile(vault);
  raw[4] = 13; // logN byte
  await fsp.writeFile(vault, raw);
  await assert.rejects(unsealToDir(vault, 'pw', path.join(await tmp(), 'out')), VaultError);
});

test('a truncated file or a foreign file is not accepted', async () => {
  const dir = await tmp();
  const foreign = path.join(dir, 'x.enc');
  await fsp.writeFile(foreign, 'hello world, definitely not a vault, but long enough to pass size check');
  await assert.rejects(unsealToDir(foreign, 'pw', path.join(dir, 'o1')), { code: 'NOT_A_VAULT' });
  const tiny = path.join(dir, 'y.enc');
  await fsp.writeFile(tiny, 'abc');
  await assert.rejects(unsealToDir(tiny, 'pw', path.join(dir, 'o2')), { code: 'NOT_A_VAULT' });
});

test('saving twice keeps the previous version as .bak and the session is reusable', async () => {
  const src = await tmp();
  const vault = path.join(await tmp(), 'vault.enc');
  await fsp.writeFile(path.join(src, 'v'), 'one');
  const session = await newSession('pw', { logN: LOG_N });
  await sealDir(src, vault, session);
  await fsp.writeFile(path.join(src, 'v'), 'two');
  await sealDir(src, vault, session);
  assert.equal(fs.existsSync(`${vault}.bak`), true);
  assert.equal(fs.existsSync(`${vault}.tmp`), false);

  const nowDir = path.join(await tmp(), 'now');
  const oldDir = path.join(await tmp(), 'old');
  await unsealToDir(vault, 'pw', nowDir);
  await unsealToDir(`${vault}.bak`, 'pw', oldDir);
  assert.equal(await fsp.readFile(path.join(nowDir, 'v'), 'utf8'), 'two');
  assert.equal(await fsp.readFile(path.join(oldDir, 'v'), 'utf8'), 'one');
});

test('two saves never reuse the same IV', async () => {
  const src = await tmp();
  const dir = await tmp();
  await fsp.writeFile(path.join(src, 'v'), 'same');
  const session = await newSession('pw', { logN: LOG_N });
  await sealDir(src, path.join(dir, 'a.enc'), session);
  await sealDir(src, path.join(dir, 'b.enc'), session);
  const ivA = (await fsp.readFile(path.join(dir, 'a.enc'))).subarray(21, 33);
  const ivB = (await fsp.readFile(path.join(dir, 'b.enc'))).subarray(21, 33);
  assert.notDeepEqual(ivA, ivB);
});

test('a new password gives a vault the old password cannot open', async () => {
  const src = await tmp();
  const vault = path.join(await tmp(), 'vault.enc');
  await fsp.writeFile(path.join(src, 'v'), 'x');
  await sealDir(src, vault, await newSession('old', { logN: LOG_N }));
  await sealDir(src, vault, await newSession('new', { logN: LOG_N }));
  await assert.rejects(unsealToDir(vault, 'old', path.join(await tmp(), 'o')), { code: 'WRONG_PASSWORD' });
  await unsealToDir(vault, 'new', path.join(await tmp(), 'o2'));
});

test('safeJoin blocks every way out of the target folder', () => {
  const root = path.join(os.tmpdir(), 'root');
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'a//b', '', 'a\\b', './x', 'a/\0b']) {
    assert.throws(() => safeJoin(root, bad), VaultError, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(safeJoin(root, 'a/b.txt'), path.join(root, 'a', 'b.txt'));
});
