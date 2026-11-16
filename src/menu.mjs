// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Entry point on the stick: unlocks the vault, shows the menu, starts Claude, saves on exit.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLATFORMS, detectPlatform, paths } from './config.mjs';
import { newSession, sealDir, unsealToDir, verifyPassword, wipeDir } from './vault.mjs';
import { loadSettings, saveSettings, loadToken, saveToken, classifyToken, tokenEnv } from './state.mjs';
import { backupVault } from './backup.mjs';
import { copyrightLine } from './copyright.mjs';
import { runClaude, claudeEnv, prepareBrowser, mcpConfig } from './runner.mjs';
import { getClaudeRelease, installClaude, installedClaudeVersion } from './download.mjs';
import { ask, askHidden, bold, clear, confirm, cyan, dim, green, pause, red, say, selectMenu, status, yellow } from './ui.mjs';

const ROOT = path.resolve(process.env.STICK_ROOT ?? path.join(import.meta.dirname, '..'));
const KEY = detectPlatform();
const P = paths(ROOT, KEY);
const TMP_PREFIX = 'claude-stick-';

let workDir = null; // temp folder on this computer, wiped at the end
let dataDir = null; // decrypted vault content (Claude's config folder)
let session = null;
let settings = null;
let token = null;
let busy = false;
let closing = false;
let lastMain = 0; // the highlight returns to where you were
let lastMore = 0;
const HELP = '↑ ↓ auswählen   Enter bestätigen   oder die Zahl tippen';

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/** Removes decrypted leftovers of an earlier run that crashed. */
async function sweepStale() {
  for (const name of await fsp.readdir(os.tmpdir()).catch(() => [])) {
    if (!name.startsWith(TMP_PREFIX)) continue;
    const dir = path.join(os.tmpdir(), name);
    const pid = Number(await fsp.readFile(path.join(dir, 'pid'), 'utf8').catch(() => 0));
    if (pid && !alive(pid)) {
      await wipeDir(dir);
      say(yellow('  Reste eines abgebrochenen Starts wurden aufgeräumt.'));
    }
  }
}

const save = () => sealDir(dataDir, P.vault, session);

async function shutdown() {
  if (closing) return;
  closing = true;
  if (session) {
    say(dim('\n  Speichere und verschlüssele ...'));
    try {
      await save();
    } catch (err) {
      say(red(`\n  Speichern fehlgeschlagen: ${err.message}`));
      say(red(`  Deine Daten bleiben unverschlüsselt hier liegen: ${workDir}`));
      say(red('  Stick wieder einstecken und den Ordner erst nach dem Speichern löschen.'));
      return;
    }
  }
  if (workDir) await wipeDir(workDir);
  if (session && settings?.backupDir && isDir(path.dirname(settings.backupDir))) {
    try {
      await backupVault(P.vault, settings.backupDir);
      say(dim('  Backup angelegt.'));
    } catch (err) {
      say(yellow(`  Backup nicht möglich: ${err.message}`));
    }
  }
  say(green('  Fertig. Alles ist verschlüsselt gespeichert. Du kannst den Stick jetzt sicher auswerfen.'));
}

function banner() {
  clear();
  say(bold(cyan('  CLAUDE-STICK')) + dim(`   ${PLATFORMS[KEY].label}`));
  say(dim('  ═══════════════════════════════════════════════════'));
}

// --- First start and unlock ----------------------------------------------------------

async function firstRun() {
  say('  Der Stick hat noch keinen Tresor. Wir legen jetzt einen an.');
  say('');
  say('  Im Tresor liegen dein Login, deine Einstellungen und der Verlauf.');
  say('  Er ist mit deinem Passwort verschlüsselt. ' + bold('Das Passwort lässt sich nicht zurücksetzen.'));
  say('  Lege es in deinen Passwortmanager, sonst ist alles für immer weg.');
  say('');
  for (;;) {
    const a = await askHidden('  Neues Passwort (mindestens 10 Zeichen): ');
    if (a.length < 10) {
      say(yellow('  Zu kurz. Ein Satz aus mehreren Wörtern ist gut zu merken und stark.'));
      continue;
    }
    const b = await askHidden('  Noch einmal: ');
    if (a !== b) {
      say(yellow('  Die beiden Eingaben passen nicht zusammen. Nochmal.'));
      continue;
    }
    say(dim('  Verschlüssele ...'));
    session = await newSession(a);
    await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
    await save();
    return;
  }
}

async function unlock() {
  if (!fs.existsSync(P.vault)) return firstRun();
  let file = P.vault;
  for (let tries = 0; tries < 3; tries++) {
    const pw = await askHidden('  Passwort: ');
    try {
      session = await unsealToDir(file, pw, dataDir);
      return;
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') {
        say(yellow('  Falsches Passwort.'));
      } else if (err.code === 'CORRUPT' && file === P.vault && fs.existsSync(`${P.vault}.bak`)) {
        say(red('  Der Tresor ist beschädigt.'));
        if (await confirm('  Die vorherige Sicherung (vault.enc.bak) versuchen?', true)) {
          file = `${P.vault}.bak`;
          tries--;
        }
      } else {
        throw err;
      }
    }
  }
  throw new Error('Zu viele falsche Versuche.');
}

// --- Menu actions ---------------------------------------------------------------------

function projectDir() {
  return settings.projectDir && isDir(settings.projectDir) ? settings.projectDir : P.projects;
}

async function persist() {
  await saveSettings(dataDir, settings);
  await save();
}

async function chooseProject() {
  banner();
  await fsp.mkdir(P.projects, { recursive: true });
  const names = (await fsp.readdir(P.projects, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  say(bold('  In welchem Ordner soll Claude arbeiten?'));
  say(dim('  Dateien in Projektordnern auf dem Stick sind nicht verschlüsselt.'));
  say(dim(`  ${HELP}`));
  say('');
  const items = [
    ...names.map((n, i) => ({ key: String(i + 1), label: n, hint: 'auf dem Stick' })),
    { key: 'n', label: 'Neuen Ordner auf dem Stick anlegen' },
    { key: 'e', label: 'Anderen Ordner auf diesem Computer eingeben' },
    { key: '0', label: 'Zurück', gapBefore: true },
  ];
  const current = names.findIndex((n) => path.join(P.projects, n) === settings.projectDir);
  const pick = await selectMenu(items, { initial: Math.max(current, 0) });
  if (pick === '0') return;
  if (pick === 'n') {
    const name = (await ask('  Name des neuen Ordners: ')).replace(/[\\/:*?"<>|]/g, '').trim();
    if (!name || name.startsWith('.')) return say(yellow('  Kein gültiger Name.'));
    await fsp.mkdir(path.join(P.projects, name), { recursive: true });
    settings.projectDir = path.join(P.projects, name);
  } else if (pick === 'e') {
    let p = await ask('  Ordner (Pfad einfügen): ');
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    p = p.replace(/^["']|["']$/g, '');
    if (!p || !isDir(p)) {
      say(yellow('  Diesen Ordner gibt es nicht.'));
      return pause();
    }
    settings.projectDir = path.resolve(p);
  } else {
    settings.projectDir = path.join(P.projects, names[Number(pick) - 1]);
  }
  await persist();
}

async function toggleBrowser() {
  settings.browser = !settings.browser;
  await persist();
  if (settings.browser && !fs.existsSync(P.browserArchive)) {
    say(yellow('  Auf dem Stick ist für dieses System noch kein Browser. Claude startet dann ohne.'));
    await pause();
  }
}

async function login() {
  banner();
  say(bold('  Anmelden (einmalig)'));
  say('');
  say('  1. Gleich öffnet sich dein Webbrowser zum Anmelden.');
  say('  2. Danach zeigt Claude einen langen Schlüssel an, der mit sk-ant- beginnt.');
  say('  3. Kopiere ihn und füge ihn hier ein (er bleibt dabei unsichtbar).');
  say('');
  say(dim('  Der Schlüssel wird nur verschlüsselt auf dem Stick gespeichert.'));
  say(dim('  Verlierst du den Stick, widerrufst du ihn in deinen Claude-Kontoeinstellungen.'));
  say('');
  if (!fs.existsSync(P.claude)) {
    say(red('  Claude fehlt für dieses System auf dem Stick.'));
    return pause();
  }
  await ask(dim('  Weiter mit Enter ... '));
  const dir = projectDir();
  await fsp.mkdir(dir, { recursive: true });
  busy = true;
  try {
    await runClaude({ bin: P.claude, args: ['setup-token'], cwd: dir, env: claudeEnv({ dataDir }), copyDir: path.join(workDir, 'bin') });
  } catch (err) {
    say(red(`  Konnte Claude nicht starten: ${err.message}`));
  } finally {
    busy = false;
  }
  say('');
  const pasted = await askHidden('  Schlüssel einfügen (leer lassen = abbrechen): ', { paste: true });
  if (!pasted.trim()) return;
  const c = classifyToken(pasted);
  if (!c) {
    say(yellow('  Das sieht nicht wie ein Schlüssel aus (er beginnt mit sk-ant-). Nichts gespeichert.'));
    return pause();
  }
  await saveToken(dataDir, c.token);
  token = c.token;
  await save();
  say(green('  Gespeichert.'));
  say(dim('  Tipp: Leere jetzt das Terminalfenster, der Schlüssel stand kurz darin.'));
  await pause();
}

async function startClaude() {
  if (!fs.existsSync(P.claude)) {
    say(red(`  Für ${PLATFORMS[KEY].label} ist Claude nicht auf dem Stick. Der Stick muss neu gebaut werden.`));
    return pause();
  }
  if (!token) {
    say(yellow('  Du bist noch nicht angemeldet (Menüpunkt 4).'));
    say(dim('  Meldest du dich in Claude selbst an, kann der Login auf diesem Computer hängen bleiben.'));
    if (!(await confirm('  Trotzdem starten?'))) return;
  }
  const args = [];
  if (settings.browser) {
    say(dim('  Browser wird vorbereitet (einige Sekunden) ...'));
    const chromium = await prepareBrowser(P.browserArchive, workDir).catch(() => null);
    if (chromium && fs.existsSync(P.mcpCli)) {
      const file = path.join(workDir, 'mcp.json');
      await fsp.writeFile(file, JSON.stringify(mcpConfig({ nodePath: P.node, mcpCli: P.mcpCli, chromiumPath: chromium })));
      args.push('--mcp-config', file);
    } else {
      say(yellow('  Browser nicht verfügbar. Claude startet ohne.'));
    }
  }
  const dir = projectDir();
  await fsp.mkdir(dir, { recursive: true });
  say(dim('  Claude startet. Mit /exit kommst du zurück ins Menü.\n'));
  busy = true;
  try {
    await runClaude({ bin: P.claude, args, cwd: dir, env: claudeEnv({ dataDir, tokenVars: tokenEnv(token) }), copyDir: path.join(workDir, 'bin') });
  } catch (err) {
    say(red(`  Konnte Claude nicht starten: ${err.message}`));
  } finally {
    busy = false;
  }
  await save().catch((err) => say(red(`  Zwischenspeichern fehlgeschlagen: ${err.message}`)));
  await pause('\n  Zurück zum Menü mit Enter ...');
}

async function setBackupDir() {
  say('  In welchen Ordner sollen die Backups? Das kann ein Ordner auf einer anderen Platte oder in der Cloud sein.');
  say(dim('  Die Backup-Dateien sind verschlüsselt, ohne dein Passwort nutzlos.'));
  let p = await ask('  Ordner (Pfad einfügen, leer = abbrechen): ');
  if (!p) return false;
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  p = path.resolve(p.replace(/^["']|["']$/g, ''));
  if (!isDir(path.dirname(p))) {
    say(yellow('  Der übergeordnete Ordner existiert nicht.'));
    await pause();
    return false;
  }
  settings.backupDir = p;
  await persist();
  return true;
}

async function backupNow() {
  banner();
  if (!settings.backupDir && !(await setBackupDir())) return;
  try {
    await save();
    const dest = await backupVault(P.vault, settings.backupDir);
    say(green(`  Backup angelegt: ${dest}`));
  } catch (err) {
    say(red(`  Backup fehlgeschlagen: ${err.message}`));
  }
  await pause();
}

async function changePassword() {
  const old = await askHidden('  Aktuelles Passwort: ');
  if (!(await verifyPassword(session, old))) {
    say(yellow('  Falsch.'));
    return pause();
  }
  const a = await askHidden('  Neues Passwort (mindestens 10 Zeichen): ');
  if (a.length < 10) {
    say(yellow('  Zu kurz.'));
    return pause();
  }
  if (a !== (await askHidden('  Noch einmal: '))) {
    say(yellow('  Die beiden Eingaben passen nicht zusammen.'));
    return pause();
  }
  session = await newSession(a);
  await save();
  say(green('  Passwort geändert. Alte Backups gelten weiter mit dem alten Passwort.'));
  await pause();
}

async function updateClaude() {
  say('  Suche neue Version ...');
  try {
    const release = await getClaudeRelease();
    for (const key of Object.keys(PLATFORMS)) {
      if (fs.existsSync(path.dirname(paths(ROOT, key).claude))) await installClaude(ROOT, key, release);
    }
  } catch (err) {
    say(red(`  Update fehlgeschlagen: ${err.message}`));
  }
  await pause();
}

async function info() {
  banner();
  say(`  Stick-Ordner   ${ROOT}`);
  say(`  System         ${PLATFORMS[KEY].label}`);
  for (const key of Object.keys(PLATFORMS)) {
    const v = await installedClaudeVersion(ROOT, key);
    if (v) say(`  Claude ${v.padEnd(9)}${PLATFORMS[key].label}`);
  }
  try {
    const s = await fsp.statfs(ROOT);
    say(`  Frei           ${((s.bavail * s.bsize) / 1073741824).toFixed(1)} GB`);
  } catch {
    /* not available everywhere */
  }
  say('');
  say(dim(`  ${copyrightLine()}`));
  await pause();
}

async function moreMenu() {
  for (;;) {
    banner();
    say(bold('  Mehr'));
    say(dim(`  ${HELP}`));
    say('');
    const pick = await selectMenu(
      [
        { key: '1', label: 'Passwort ändern' },
        { key: '2', label: 'Backup-Ordner ändern', hint: settings.backupDir ?? 'noch keiner' },
        { key: '3', label: 'Claude auf dem Stick aktualisieren', hint: 'braucht Internet' },
        { key: '4', label: 'Info' },
        { key: '0', label: 'Zurück', gapBefore: true },
      ],
      { initial: lastMore },
    );
    lastMore = ['1', '2', '3', '4', '0'].indexOf(pick);
    if (pick === '0') return;
    if (pick === '1') await changePassword();
    if (pick === '2') await setBackupDir();
    if (pick === '3') await updateClaude();
    if (pick === '4') await info();
  }
}

async function mainMenu() {
  for (;;) {
    banner();
    say(status('Ordner', 'ok', projectDir()));
    say(status('Browser', settings.browser ? 'ok' : 'off', settings.browser ? 'an' : 'aus'));
    say(status('Login', token ? 'ok' : 'warn', token ? 'gespeichert' : 'noch nicht eingerichtet (Punkt 4)'));
    say(status('Backup', settings.backupDir ? 'ok' : 'off', settings.backupDir ?? 'noch nicht eingerichtet'));
    say('');
    say(dim(`  ${HELP}`));
    say('');
    const keys = ['1', '2', '3', '4', '5', '6', '0'];
    const pick = await selectMenu(
      [
        { key: '1', label: 'Claude starten', primary: true },
        { key: '2', label: 'Projektordner wählen' },
        { key: '3', label: 'Browser für Claude', hint: settings.browser ? 'ausschalten' : 'einschalten' },
        { key: '4', label: 'Anmelden', hint: token ? 'neu einrichten' : 'einmalig nötig' },
        { key: '5', label: 'Backup jetzt machen' },
        { key: '6', label: 'Mehr', hint: 'Passwort, Backup-Ordner, Update' },
        { key: '0', label: 'Beenden', hint: 'speichert alles verschlüsselt', gapBefore: true },
      ],
      { initial: lastMain },
    );
    lastMain = keys.indexOf(pick);
    if (pick === '0') return;
    if (pick === '1') await startClaude();
    if (pick === '2') await chooseProject();
    if (pick === '3') await toggleBrowser();
    if (pick === '4') await login();
    if (pick === '5') await backupNow();
    if (pick === '6') await moreMenu();
  }
}

async function main() {
  process.on('SIGINT', () => {
    if (busy) return; // Ctrl+C belongs to Claude while it runs
    shutdown().finally(() => process.exit(130));
  });
  banner();
  await sweepStale();
  workDir = await fsp.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
  await fsp.chmod(workDir, 0o700);
  await fsp.writeFile(path.join(workDir, 'pid'), String(process.pid));
  dataDir = path.join(workDir, 'data');
  try {
    await unlock();
  } catch (err) {
    say(red(`\n  ${err.message}`));
    await wipeDir(workDir);
    process.exit(1);
  }
  settings = await loadSettings(dataDir);
  token = await loadToken(dataDir);
  try {
    await mainMenu();
  } catch (err) {
    say(red(`\n  Fehler: ${err.message}`));
  }
  await shutdown();
}

main().catch(async (err) => {
  say(red(`\n  Unerwarteter Fehler: ${err.message}`));
  await shutdown();
  process.exit(1);
});
