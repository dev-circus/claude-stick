// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Small settings and the login key. Everything here lives inside the encrypted vault.

import fsp from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_SETTINGS = { browser: false, projectDir: null, backupDir: null };

const dirOf = (dataDir) => path.join(dataDir, '.stick');

export async function loadSettings(dataDir) {
  try {
    const raw = JSON.parse(await fsp.readFile(path.join(dirOf(dataDir), 'settings.json'), 'utf8'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(dataDir, settings) {
  await fsp.mkdir(dirOf(dataDir), { recursive: true, mode: 0o700 });
  await fsp.writeFile(path.join(dirOf(dataDir), 'settings.json'), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

export async function loadToken(dataDir) {
  try {
    return (await fsp.readFile(path.join(dirOf(dataDir), 'token'), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

export async function saveToken(dataDir, token) {
  await fsp.mkdir(dirOf(dataDir), { recursive: true, mode: 0o700 });
  await fsp.writeFile(path.join(dirOf(dataDir), 'token'), token.trim(), { mode: 0o600 });
}

/** Login keys from `claude setup-token` start with sk-ant-oat, API keys with sk-ant-api. */
export function classifyToken(text) {
  const t = (text ?? '').trim();
  if (/^sk-ant-oat[\w-]{10,}$/.test(t)) return { kind: 'oauth', token: t };
  if (/^sk-ant-api[\w-]{10,}$/.test(t)) return { kind: 'api', token: t };
  return null;
}

/** Environment variables that hand the stored key to Claude Code. */
export function tokenEnv(token) {
  const c = classifyToken(token);
  if (!c) return {};
  return c.kind === 'oauth' ? { CLAUDE_CODE_OAUTH_TOKEN: c.token } : { ANTHROPIC_API_KEY: c.token };
}
