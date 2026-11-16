// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// The one list of files that make up a stick. Used by the build tool (to fill a stick) and
// the package tool (to make the small download), so both always carry the same files.

import fsp from 'node:fs/promises';
import path from 'node:path';

const toCrlf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r?\n/g, '\r\n'));
const toLf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'));

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
  await put('start/ANLEITUNG.txt', 'ANLEITUNG.txt', { crlf: true });
  await put('LICENSE', 'LICENSE');
  await put('mcp/package.json', 'mcp/package.json');
  await put('mcp/package-lock.json', 'mcp/package-lock.json');
  await fsp.mkdir(path.join(dest, 'launcher'), { recursive: true });
  await fsp.writeFile(path.join(dest, 'launcher', 'NODE_VERSION'), `${nodeVersion}\n`);
}
