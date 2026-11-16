// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Encrypted container for a whole directory (login token, settings, history).
//
// Format:  MAGIC(4) | logN(1) | salt(16) | iv(12) | check(32) | ciphertext | tag(16)
//  - key   = scrypt(password, salt, N = 2^logN, r = 8, p = 1)
//  - cipher = AES-256-GCM, the whole header is authenticated as AAD
//  - check = HMAC(key, label): lets us reject a wrong password before decrypting anything
//  - plaintext = simple archive: [pathLen u32][size u64][path][bytes] ... then 12 zero bytes
//
// GCM only proves integrity at the very end. Until then the plaintext may have been
// bit-flipped by an attacker, so every path is validated and the target dir is wiped on failure.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const MAGIC = Buffer.from('CSV1');
const SALT_LEN = 16;
const IV_LEN = 12;
const CHECK_LEN = 32;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN + CHECK_LEN;
const CHECK_LABEL = 'claude-stick vault v1';
const MIN_LOG_N = 12; // cheap enough for tests
const MAX_LOG_N = 20; // refuse absurd values from a damaged or hostile file
const DEFAULT_LOG_N = 17; // ~128 MB of memory, well under a second on current hardware
const CHUNK = 1024 * 1024;

export class VaultError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

async function deriveKey(password, salt, logN) {
  if (!Number.isInteger(logN) || logN < MIN_LOG_N || logN > MAX_LOG_N) {
    throw new VaultError('NOT_A_VAULT', 'Ungültige Verschlüsselungsparameter');
  }
  const N = 2 ** logN;
  return scrypt(password.normalize('NFKC'), salt, 32, {
    N,
    r: 8,
    p: 1,
    maxmem: 128 * N * 8 + 64 * 1024 * 1024,
  });
}

function checkValue(key) {
  return crypto.createHmac('sha256', key).update(CHECK_LABEL).digest();
}

/** Creates a fresh key (new salt) for a password. Reuse the session for repeated saves. */
export async function newSession(password, { logN = DEFAULT_LOG_N } = {}) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = await deriveKey(password, salt, logN);
  return { key, salt, logN };
}

/** True if password is the one this session was created with. */
export async function verifyPassword(session, password) {
  const key = await deriveKey(password, session.salt, session.logN);
  return crypto.timingSafeEqual(key, session.key);
}

/** Resolves an archive path inside root and refuses anything that escapes it. */
export function safeJoin(root, rel) {
  if (!rel || rel.includes('\0') || rel.includes('\\') || path.posix.isAbsolute(rel)) {
    throw new VaultError('CORRUPT', 'Unzulässiger Pfad im Tresor');
  }
  const parts = rel.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) {
    throw new VaultError('CORRUPT', 'Unzulässiger Pfad im Tresor');
  }
  const full = path.join(root, ...parts);
  const base = path.resolve(root) + path.sep;
  if (!path.resolve(full).startsWith(base)) {
    throw new VaultError('CORRUPT', 'Unzulässiger Pfad im Tresor');
  }
  return full;
}

async function* walk(root, rel = '') {
  const entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(root, childRel);
    else if (e.isFile()) yield childRel; // symlinks and special files are skipped on purpose
  }
}

async function* packDir(dir) {
  for await (const rel of walk(dir)) {
    const abs = path.join(dir, ...rel.split('/'));
    const size = (await fsp.stat(abs)).size;
    const name = Buffer.from(rel, 'utf8');
    const head = Buffer.alloc(12);
    head.writeUInt32BE(name.length, 0);
    head.writeBigUInt64BE(BigInt(size), 4);
    yield head;
    yield name;
    let sent = 0;
    for await (const chunk of fs.createReadStream(abs, { highWaterMark: CHUNK })) {
      sent += chunk.length;
      yield chunk;
    }
    if (sent !== size) throw new VaultError('CORRUPT', `Datei hat sich beim Sichern geändert: ${rel}`);
  }
  yield Buffer.alloc(12); // end marker
}

/** Packs and encrypts dir into file. The old file is kept as file.bak. */
export async function sealDir(dir, file, session) {
  const iv = crypto.randomBytes(IV_LEN);
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([session.logN]),
    session.salt,
    iv,
    checkValue(session.key),
  ]);
  const cipher = crypto.createCipheriv('aes-256-gcm', session.key, iv);
  cipher.setAAD(header);

  const tmp = `${file}.tmp`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.write(header);
    for await (const plain of packDir(dir)) {
      const enc = cipher.update(plain);
      if (enc.length) await fh.write(enc);
    }
    const last = cipher.final();
    if (last.length) await fh.write(last);
    await fh.write(cipher.getAuthTag());
    await fh.sync();
  } catch (err) {
    await fh.close();
    await fsp.rm(tmp, { force: true });
    throw err;
  }
  await fh.close();

  if (fs.existsSync(file)) await fsp.copyFile(file, `${file}.bak`);
  await fsp.rename(tmp, file);
}

class Reader {
  constructor(iterable) {
    this.it = iterable[Symbol.asyncIterator]();
    this.buf = Buffer.alloc(0);
  }

  async fill() {
    const { value, done } = await this.it.next();
    if (done) return false;
    this.buf = this.buf.length ? Buffer.concat([this.buf, value]) : value;
    return true;
  }

  async read(n) {
    while (this.buf.length < n) {
      if (!(await this.fill())) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  async readSome(max) {
    if (!this.buf.length && !(await this.fill())) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
    const out = this.buf.subarray(0, Math.min(max, this.buf.length));
    this.buf = this.buf.subarray(out.length);
    return out;
  }

  /** Reads to the end, which also makes the cipher verify the authentication tag. */
  async finish() {
    if (this.buf.length) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
    while (await this.fill()) {
      if (this.buf.length) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
    }
  }
}

async function readHeader(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    if (size < HEADER_LEN + TAG_LEN) throw new VaultError('NOT_A_VAULT', 'Das ist kein Tresor');
    const header = Buffer.alloc(HEADER_LEN);
    await fh.read(header, 0, HEADER_LEN, 0);
    const tag = Buffer.alloc(TAG_LEN);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new VaultError('NOT_A_VAULT', 'Das ist kein Tresor');
    }
    return { header, tag, size };
  } finally {
    await fh.close();
  }
}

/**
 * Decrypts file into destDir (which this call owns: it is wiped again on any failure)
 * and returns the session, so the caller can seal again without a second key derivation.
 */
export async function unsealToDir(file, password, destDir) {
  const { header, tag, size } = await readHeader(file);
  const logN = header[MAGIC.length];
  const salt = header.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN);
  const iv = header.subarray(MAGIC.length + 1 + SALT_LEN, MAGIC.length + 1 + SALT_LEN + IV_LEN);
  const check = header.subarray(HEADER_LEN - CHECK_LEN);

  const key = await deriveKey(password, salt, logN);
  const expected = checkValue(key);
  if (!crypto.timingSafeEqual(check, expected)) {
    throw new VaultError('WRONG_PASSWORD', 'Falsches Passwort');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  async function* plain() {
    const src = fs.createReadStream(file, {
      start: HEADER_LEN,
      end: size - TAG_LEN - 1,
      highWaterMark: CHUNK,
    });
    for await (const chunk of src) {
      const out = decipher.update(chunk);
      if (out.length) yield out;
    }
    let last;
    try {
      last = decipher.final();
    } catch {
      throw new VaultError('CORRUPT', 'Tresor ist beschädigt oder wurde verändert');
    }
    if (last.length) yield last;
  }

  await fsp.mkdir(destDir, { recursive: true, mode: 0o700 });
  try {
    const reader = new Reader(plain());
    for (;;) {
      const head = await reader.read(12);
      const nameLen = head.readUInt32BE(0);
      const fileSize = head.readBigUInt64BE(4);
      if (nameLen === 0) {
        if (fileSize !== 0n) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
        break;
      }
      if (nameLen > 4096) throw new VaultError('CORRUPT', 'Tresor ist beschädigt');
      const rel = (await reader.read(nameLen)).toString('utf8');
      const target = safeJoin(destDir, rel);
      await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const out = await fsp.open(target, 'w', 0o600);
      try {
        let left = fileSize;
        while (left > 0n) {
          const part = await reader.readSome(Number(left > BigInt(CHUNK) ? BigInt(CHUNK) : left));
          await out.write(part);
          left -= BigInt(part.length);
        }
      } finally {
        await out.close();
      }
    }
    await reader.finish();
  } catch (err) {
    await wipeDir(destDir);
    throw err instanceof VaultError ? err : new VaultError('CORRUPT', err.message);
  }
  return { key, salt, logN };
}

/** Removes a directory tree. Plain delete: the vault is the secure copy, this is a temp dir. */
export async function wipeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
