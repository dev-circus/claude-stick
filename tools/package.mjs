#!/usr/bin/env node
// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Makes the small download for non-technical users: dist/claude-stick.zip (well under 1 MB).
// It carries no Claude Code and no Node.js; the first start fetches those from their publishers.
//
//   node tools/package.mjs [--out dist]          zip + checksum file
//   node tools/package.mjs --stage-only <dir>    just the folder, no zip (used by CI)

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getNodeRelease } from '../src/download.mjs';
import { stageFiles } from './stage.mjs';

const run = promisify(execFile);
const repo = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const node = await getNodeRelease();

const stageOnly = value('--stage-only');
if (stageOnly) {
  await stageFiles(repo, path.resolve(stageOnly), { nodeVersion: node.version });
  console.log(`Ordner fertig: ${path.resolve(stageOnly)} (Node.js ${node.version})`);
  process.exit(0);
}

const out = path.resolve(value('--out') ?? path.join(repo, 'dist'));
const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'claude-stick-pkg-'));
try {
  // One top folder, so unpacking never scatters files into the Downloads folder.
  await stageFiles(repo, path.join(work, 'claude-stick'), { nodeVersion: node.version });
  await fsp.mkdir(out, { recursive: true });
  const zip = path.join(out, 'claude-stick.zip');
  await fsp.rm(zip, { force: true });
  // -X: no extra file attributes. The unix modes (start files executable) stay inside the zip.
  await run('zip', ['-qr', '-X', zip, 'claude-stick'], { cwd: work });
  const hash = crypto.createHash('sha256').update(await fsp.readFile(zip)).digest('hex');
  await fsp.writeFile(`${zip}.sha256`, `${hash}  claude-stick.zip\n`);
  const size = (await fsp.stat(zip)).size;
  console.log(`Fertig: ${zip} (${(size / 1024).toFixed(0)} KB)\nSHA-256: ${hash}`);
} finally {
  await fsp.rm(work, { recursive: true, force: true });
}
