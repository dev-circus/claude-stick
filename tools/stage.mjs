// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// The one list of files that make up a stick. Used by the build tool (to fill a stick) and
// the package tool (to make the small download), so both always carry the same files.

import fsp from 'node:fs/promises';
import path from 'node:path';

const toCrlf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r?\n/g, '\r\n'));
const toLf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'));

/** Turns the guide's light Markdown into plain text, for people who open it in Notepad. */
export function mdToText(md) {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^# (.*)$/gm, (_, t) => `${t}\n${'='.repeat(t.length)}`)
    .replace(/^## (.*)$/gm, (_, t) => `${t}\n${'-'.repeat(t.length)}`)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

/** Copies the stick's own files from the repo into dest. Never touches downloads or the vault. */
export async function stageFiles(repo, dest, { nodeVersion }) {
  const put = async (from, to, { crlf = false, lf = false, mode } = {}) => {
    let data = await fsp.readFile(path.join(repo, from));
    if (crlf) data = toCrlf(data); // cmd.exe and PowerShell are happiest with Windows line endings
    if (lf) data = toLf(data); // bash refuses scripts with Windows line endings, whatever git did on checkout
    const target = path.join(dest, to);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
    if (mode) await fsp.chmod(target, mode).catch(() => {}); // exFAT has no modes, that is fine
  };

  for (const name of (await fsp.readdir(path.join(repo, 'src'))).filter((n) => n.endsWith('.mjs'))) {
    await put(`src/${name}`, `launcher/${name}`);
  }
  await put('start/Start-Mac.command', 'Start-Mac.command', { lf: true, mode: 0o755 });
  await put('start/Start-Linux.sh', 'Start-Linux.sh', { lf: true, mode: 0o755 });
  await put('start/Start-Windows.bat', 'Start-Windows.bat', { crlf: true });
  await put('start/get-node.ps1', 'launcher/get-node.ps1', { crlf: true });
  // One source for the guide: ANLEITUNG.md in the repo root, shown on GitHub and shipped as plain text.
  const guide = mdToText(await fsp.readFile(path.join(repo, 'ANLEITUNG.md'), 'utf8'));
  await fsp.writeFile(path.join(dest, 'ANLEITUNG.txt'), toCrlf(Buffer.from(guide)));
  await put('LICENSE', 'LICENSE');
  await put('mcp/package.json', 'mcp/package.json');
  await put('mcp/package-lock.json', 'mcp/package-lock.json');
  await fsp.mkdir(path.join(dest, 'launcher'), { recursive: true });
  await fsp.writeFile(path.join(dest, 'launcher', 'NODE_VERSION'), `${nodeVersion}\n`);
}
