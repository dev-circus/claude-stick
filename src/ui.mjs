// © 2026 >devcircus_ · www.dev-circus.com · by Patrick B. Stang
// Tiny terminal helpers: colors, questions, hidden password input.

import readline from 'node:readline';
import readlinePromises from 'node:readline/promises';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const bold = wrap('1');
export const dim = wrap('2');
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const cyan = wrap('36');

export function clear() {
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

export function say(text = '') {
  process.stdout.write(`${text}\n`);
}

/** Asks one question; an empty answer returns `def`. */
export async function ask(question, def = '') {
  const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
  // Without this, Ctrl+C would only pause input and the program would hang.
  rl.once('SIGINT', () => {
    rl.close();
    process.emit('SIGINT');
  });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || def;
  } finally {
    rl.close();
  }
}

export async function confirm(question, def = false) {
  const hint = def ? 'J/n' : 'j/N';
  const a = (await ask(`${question} (${hint}) `)).toLowerCase();
  if (!a) return def;
  return ['j', 'ja', 'y', 'yes'].includes(a);
}

export async function pause(text = 'Weiter mit Enter ...') {
  await ask(dim(text));
}

/**
 * Applies one typed character to state.buf and says what happened:
 * 'enter', 'cancel', 'char' (something was added) or 'none'.
 * In paste mode spaces and tabs are dropped, because a key copied across two lines
 * arrives with an indent in the middle.
 */
export function applyKey(state, ch, paste = false) {
  if (ch === '\r' || ch === '\n') return 'enter';
  if (ch === '\u0003') return 'cancel';
  if (ch === '\u007f' || ch === '\b') {
    state.buf = state.buf.slice(0, -1);
    return 'none';
  }
  if (ch > ' ' || (ch === ' ' && !paste)) {
    state.buf += ch;
    return 'char';
  }
  return 'none';
}

/**
 * Reads a secret without echoing it. Ctrl+C rejects.
 * With `paste: true` whitespace is dropped and Enter only ends the input once nothing more
 * arrives for a moment, so a key that was copied across two lines still comes out in one piece.
 */
export function askHidden(question, { paste = false } = {}) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      process.stdout.write(question);
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
      return;
    }
    let timer = null;
    const finish = (fn, value) => {
      clearTimeout(timer);
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      fn(value);
    };
    const state = { buf: '' };
    const onData = (chunk) => {
      for (const ch of chunk) {
        const action = applyKey(state, ch, paste);
        if (action === 'cancel') return finish(reject, new Error('abgebrochen'));
        if (action === 'enter') {
          if (!paste) return finish(resolve, state.buf);
          clearTimeout(timer);
          timer = setTimeout(() => finish(resolve, state.buf), 300);
        } else if (action === 'char') {
          clearTimeout(timer);
        }
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true); // before the prompt appears, so nothing typed or pasted can be echoed
    stdin.resume();
    stdin.on('data', onData);
    process.stdout.write(question);
  });
}

const INVERSE = '\x1b[7m';
const RESET = '\x1b[0m';

if (process.stdout.isTTY) process.on('exit', () => process.stdout.write('\x1b[?25h')); // never leave the cursor hidden

/** Splits raw terminal input into single keys (arrow keys arrive as 3-character sequences). */
export function tokenize(text) {
  return text.match(/\x1b\[[0-9;]*[A-Za-z~]|\x1bO[A-Za-z]|\r\n|[\s\S]/gu) ?? [];
}

export function parseKey(token) {
  if (token === '\x1b[A' || token === '\x1bOA') return { name: 'up' };
  if (token === '\x1b[B' || token === '\x1bOB') return { name: 'down' };
  if (token === '\r' || token === '\n' || token === '\r\n') return { name: 'enter' };
  if (token === '\x1b') return { name: 'esc' };
  if (token === '\u0003') return { name: 'cancel' };
  if (token.length === 1 && token > ' ') return { name: 'char', char: token };
  return { name: 'none' };
}

/** Moves the highlight up (-1) or down (+1) and wraps around at the ends. */
export function moveIndex(index, step, length) {
  return (index + step + length) % length;
}

const fit = (text, width) => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width));

/**
 * Draws the menu lines. The picked line is a full-width highlighted bar; index -1 highlights none.
 * Item: { key, label, hint?, primary?, gapBefore? }
 */
export function renderItems(items, index, width = 52) {
  const lines = [];
  items.forEach((item, i) => {
    if (item.gapBefore) lines.push('');
    const picked = i === index;
    const text = `${picked ? '>' : ' '} ${String(item.key).padEnd(2)} ${item.label}${item.hint ? `   ${item.hint}` : ''}`;
    if (picked) lines.push(`  ${color ? INVERSE : ''}${fit(text, width)}${color ? RESET : ''}`);
    else {
      const label = item.primary ? bold(item.label) : item.label;
      const hint = item.hint ? `   ${dim(item.hint)}` : '';
      lines.push(`  ${fit(`  ${String(item.key).padEnd(2)} `, 5)}${label}${hint}`);
    }
  });
  return lines;
}

/** A status line with a colored dot: ok = green, warn = yellow, off = gray. */
export function status(label, state, text) {
  const dot = { ok: green('●'), warn: yellow('●'), off: dim('○') }[state];
  return `  ${dim(label.padEnd(9))}${dot} ${state === 'off' ? dim(text) : text}`;
}

/**
 * Arrow-key menu. Up/Down move, Enter picks, a typed key picks directly, Esc picks "0".
 * Without a terminal it falls back to typing the key. Returns the picked item's key.
 */
export function selectMenu(items, { initial = 0, width } = {}) {
  const w = width ?? Math.max(20, Math.min((process.stdout.columns || 80) - 4, 56));
  if (!process.stdin.isTTY) {
    for (const line of renderItems(items, -1, w)) say(line);
    return choose(items);
  }
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;
    let index = Math.min(Math.max(initial, 0), items.length - 1);
    let done = false;
    let first = true;
    const draw = () => {
      const lines = renderItems(items, index, w);
      if (!first) out.write(`\x1b[${lines.length}A`);
      first = false;
      for (const line of lines) out.write(`\x1b[2K\r${line}\n`);
    };
    const restore = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      out.write('\x1b[?25h');
    };
    // A typed key picks at once. A moment later we stop listening so a following Enter is swallowed.
    const pick = (key, swallow) => {
      done = true;
      if (!swallow) {
        restore();
        resolve(key);
      } else {
        setTimeout(() => {
          restore();
          resolve(key);
        }, 120);
      }
    };
    const onData = (chunk) => {
      if (done) return;
      for (const token of tokenize(String(chunk))) {
        const key = parseKey(token);
        if (key.name === 'up') index = moveIndex(index, -1, items.length);
        else if (key.name === 'down') index = moveIndex(index, 1, items.length);
        else if (key.name === 'enter') return pick(items[index].key, false);
        else if (key.name === 'esc') {
          if (items.some((i) => i.key === '0')) return pick('0', false);
        } else if (key.name === 'cancel') {
          restore();
          process.emit('SIGINT');
          return;
        } else if (key.name === 'char') {
          const hit = items.find((i) => String(i.key).toLowerCase() === key.char.toLowerCase());
          if (hit) {
            index = items.indexOf(hit);
            draw();
            return pick(hit.key, true);
          }
        }
      }
      draw();
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    out.write('\x1b[?25l');
    draw();
    stdin.on('data', onData);
  });
}

/** Shows numbered choices and returns the picked key (used when there is no terminal). */
export async function choose(items, prompt = 'Deine Wahl: ') {
  for (;;) {
    const a = await ask(prompt);
    const hit = items.find((i) => String(i.key) === a);
    if (hit) return hit.key;
    say(yellow('  Bitte eine der angezeigten Zahlen eingeben.'));
  }
}
