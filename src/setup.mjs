// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// First-start setup: fetches what this system is still missing, so the stick can start
// out as a tiny download and fill itself.

import fs from 'node:fs';
import { PLATFORMS, paths } from './config.mjs';
import { getClaudeRelease, installBrowser, installClaude, installMcp } from './download.mjs';
import { confirm, dim, red, say } from './ui.mjs';

/** Makes sure Claude Code for this system is on the stick. Returns false if it could not be fetched. */
export async function ensureClaude(root, key) {
  if (fs.existsSync(paths(root, key).claude)) return true;
  say(`  Erster Start auf diesem System (${PLATFORMS[key].label}): Claude wird geladen.`);
  say(dim('  Das passiert einmalig, braucht Internet und etwa 350 MB. Bitte etwas Geduld.'));
  say('');
  try {
    await installClaude(root, key, await getClaudeRelease(), { log: (m) => say(dim(m)) });
    say('');
    return true;
  } catch (err) {
    say(red(`\n  Das Laden hat nicht geklappt: ${err.message}`));
    say(red('  Ist der Computer online? Du kannst es später im Menü unter "Mehr" erneut versuchen.'));
    return false;
  }
}

/** Makes sure the browser (tool and Chromium) for this system is on the stick. */
export async function ensureBrowser(root, key) {
  const p = paths(root, key);
  if (fs.existsSync(p.browserArchive) && fs.existsSync(p.mcpCli)) return true;
  say('  Der Browser für Claude ist auf dem Stick noch nicht vorhanden.');
  say(dim('  Er wird einmalig geladen: braucht Internet und etwa 250 MB.'));
  if (!(await confirm('  Jetzt laden?', true))) return false;
  const log = (m) => say(dim(m));
  try {
    if (!fs.existsSync(p.mcpCli)) await installMcp(root, p.mcpDir, { log });
    if (!fs.existsSync(p.browserArchive)) await installBrowser(root, key, { log });
    return true;
  } catch (err) {
    say(red(`  Das Laden hat nicht geklappt: ${err.message}`));
    return false;
  }
}
