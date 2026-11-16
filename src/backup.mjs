// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
import fsp from 'node:fs/promises';
import path from 'node:path';

const PREFIX = 'claude-stick-vault-';
const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Copies the (already encrypted) vault to dir and keeps only the newest `keep` copies. */
export async function backupVault(vaultFile, dir, { keep = 10, now = new Date() } = {}) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${PREFIX}${stamp(now)}.enc`);
  await fsp.copyFile(vaultFile, dest);
  const old = (await fsp.readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith('.enc')).sort();
  for (const f of old.slice(0, Math.max(0, old.length - keep))) {
    await fsp.rm(path.join(dir, f), { force: true });
  }
  return dest;
}
