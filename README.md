# claude-stick

Portable [Claude Code](https://claude.ai/code) for macOS, Windows and Linux. Everything lives on
one exFAT partition or stick: the programs for each system, an optional browser Claude can
drive, a small terminal menu (in German) and an encrypted vault for login, settings and history.

The stick is a working copy, never the only original. This repo can rebuild it from scratch.

## Quick start for everyone (no terminal, no installs)

1. Download `claude-stick.zip` from the
   [latest release](https://github.com/dev-circus/claude-stick/releases/latest) (under 100 KB).
2. Unpack it onto a stick or external drive formatted as exFAT, or into any folder.
3. Start it (table below). `ANLEITUNG.txt` inside the zip explains this in German, including the
   one-time warning macOS and Windows show for downloaded files.
4. The first start on each computer fetches what that system needs (Node.js, then Claude Code,
   about 400 MB, all checked against the publishers' checksums). The browser is fetched the first
   time you switch it on. You need internet whenever you use Claude, as Claude itself works online.

The same stick can then be plugged into another system and sets itself up there as well.

## Quick start for developers

1. Build a full stick yourself (needs Node.js 20+ and about 3 GB free). This fetches every
   system up front, so the stick also works offline for starting and unlocking:

   ```bash
   node tools/build.mjs /Volumes/CLAUDE
   ```

2. Start it on the computer you are at:

   | System  | How                                                         |
   | ------- | ----------------------------------------------------------- |
   | macOS   | double-click `Start-Mac.command`                            |
   | Windows | double-click `Start-Windows.bat`                            |
   | Linux   | `bash /media/$USER/CLAUDE/Start-Linux.sh` (path differs by distro) |

3. First start: choose a vault password (at least 10 characters, it cannot be recovered).
4. In the menu pick **Anmelden** once. Claude shows a long key, you paste it into the menu, it is
   stored inside the vault. From then on the vault password is all you need, on every system.
5. Pick **Claude starten**. Quit with **Beenden** so everything is saved and cleaned up.

The menu works with arrow keys and Enter, or by typing the number. Esc goes back.

## What is on the stick

```
Start-Mac.command   Start-Windows.bat   Start-Linux.sh
launcher/                  the menu (copied from src/)
runtime/<system>/          Node.js, runs the menu
bin/<system>/              Claude Code
browser/<system>.tar.gz    Chromium, unpacked into a temp folder only while the browser is on
mcp/                       Playwright MCP, lets Claude control that Chromium
vault.enc                  encrypted: login key, Claude config, history, menu settings
projekte/                  default project folders (NOT encrypted)
```

## Build or update

```bash
node tools/build.mjs /Volumes/CLAUDE [--platforms darwin-arm64,win32-x64,linux-x64] [--no-browser] [--force]
```

Systems: `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`, `linux-arm64`.
Re-running only fetches what is missing or outdated, and it never touches `vault.enc` or
`projekte/`. The menu also has an update entry for Claude Code itself.

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

- macOS is tested by hand. On Windows the stick was blocked by a company group policy; Windows
  without such a policy and Linux are not tested by hand yet. The unit tests run on Linux, macOS
  and Windows in CI.
- Computers with application control (AppLocker, group policy, managed company laptops) do not
  run programs from a stick. This is intended behaviour of those systems and is not worked
  around. Use claude.ai in a browser there.
- The stick carries the normal glibc Linux build. Alpine (musl) is not included.
- Chromium on Linux needs the usual desktop libraries (nss, gtk).
- Linux may mount sticks without permission to run programs. `Start-Linux.sh` falls back to a
  copy in `~/.cache/claude-stick`.
- exFAT has no symlinks, which is why the browser is stored as one archive.

## Development

```bash
npm test                                   # unit tests
node tools/package.mjs --out dist          # makes dist/claude-stick.zip (the small download)
git tag v0.1.0 && git push origin v0.1.0   # CI builds the zip and attaches it to a release
```

`tools/stage.mjs` is the one list of files a stick consists of; the build tool and the package
tool both use it. The browser tool is installed straight from `mcp/package-lock.json`: each
package is downloaded from the npm registry, checked against the lockfile's hash and unpacked,
with no npm and no install scripts involved.

No runtime dependencies besides Node.js. `mcp/package.json` and its lockfile pin the browser
tool that gets installed onto the stick. CI runs a secrets scan, an audit of that tool and the
tests on Linux, macOS and Windows.

## License

MIT, see [LICENSE](LICENSE). This covers the code of this project only. Claude Code, Node.js and
Chromium are downloaded from their publishers and stay under their own terms.

---

© 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
