# claude-stick

Portable Claude Code for macOS, Windows and Linux. Everything lives on one exFAT partition or
stick: the programs for each system, an optional browser Claude can drive, a small German
terminal menu, and an encrypted vault for login, settings and history.

The stick is a working copy, never the only original. This repo can rebuild it from scratch.

## Layout on the stick

```
Start-Mac.command   Start-Windows.bat   Start-Linux.sh   double-click (Linux: bash Start-Linux.sh)
launcher/           the menu (copied from src/)
runtime/<system>/   Node.js, runs the menu
bin/<system>/       Claude Code
browser/<system>.tar.gz   Chromium, unpacked into a temp folder only when the browser is on
mcp/                Playwright MCP, lets Claude control that Chromium
vault.enc           encrypted: login key, Claude config, history, menu settings
projekte/           default project folders (NOT encrypted)
```

## Build or update a stick

```bash
node tools/build.mjs /Volumes/CLAUDE
```

Options: `--platforms darwin-arm64,win32-x64,linux-x64` (default), `--no-browser`, `--force`.
Systems: `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`, `linux-arm64`.
Re-running only fetches what is missing or outdated. Every download is verified against the
publisher's SHA-256 checksum; a mismatch discards the file. `vault.enc` and `projekte/` are
never touched.

## Security model

- `vault.enc`: AES-256-GCM, key from the password via scrypt (N=2^17). The header is
  authenticated, a wrong password is rejected before anything is decrypted, a tampered file is
  detected and nothing is kept. The previous version is kept as `vault.enc.bak`.
- The password cannot be recovered. Keep it in a password manager.
- At start the vault is unpacked into a private temp folder on the host computer and removed
  on exit. Leftovers of a crashed run are removed at the next start.
- Login uses a key from `claude setup-token`, stored only inside the vault and handed to Claude
  through an environment variable. Nothing is written to the host's keychain. If you sign in
  with `/login` inside Claude instead, macOS may keep that login in the host's keychain.
- A key from `setup-token` is meant for running Claude; some account features may be
  unavailable with it.
- The browser runs with an isolated, in-memory profile, so no cookies or history stay behind.
- Downloads come from the official hosts over HTTPS (Claude Code from the same address the
  official installer uses, Node.js from nodejs.org). The checksums catch broken or swapped
  files, but they come from the same host, so they cannot protect against a compromised host.
  Chromium is downloaded by Playwright itself and is not checked by this project.
- The login key is handed to Claude through an environment variable, which other programs of
  the same user on the same computer can read while Claude runs.
- The temp folder is deleted normally, not overwritten. On a computer you do not trust, assume
  traces of the unpacked vault can remain on its disk.
- Project folders on the stick are plain files. Put sensitive work into the vault or encrypt
  the stick itself.

## Backup

The menu can copy the (already encrypted) vault to a folder on another disk or a cloud folder
and keeps the newest 10 copies. It also does this automatically when the menu is closed.

## Known limits

- macOS is tested. On Windows the stick was blocked by a company group policy (programs from
  removable drives are not allowed); Windows without such a policy and Linux are still untested.
- Computers with application control (AppLocker, group policy, managed company laptops) do not
  run programs from a stick. This is intended behaviour of those systems and is not worked
  around. Use claude.ai in a browser there.
- Chromium on Linux needs the usual desktop libraries (nss, gtk).
- Linux may mount sticks without permission to run programs. `Start-Linux.sh` falls back to a
  copy in `~/.cache/claude-stick`.
- exFAT has no symlinks, which is why the browser is stored as one archive.

## Development

```bash
npm test      # unit tests (vault, downloads, settings, backup, browser lookup)
```

No runtime dependencies besides Node.js. `mcp/package.json` and its lockfile pin the browser
tool that gets installed onto the stick.
