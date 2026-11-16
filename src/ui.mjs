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

/** Reads a secret without echoing it. Ctrl+C rejects. */
export function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
      return;
    }
    let buf = '';
    const finish = (fn, value) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      fn(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish(resolve, buf);
        if (ch === '\u0003') return finish(reject, new Error('abgebrochen'));
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch;
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Shows numbered choices and returns the picked key. */
export async function choose(items, prompt = 'Deine Wahl: ') {
  for (;;) {
    const a = await ask(prompt);
    const hit = items.find((i) => String(i.key) === a);
    if (hit) return hit.key;
    say(yellow('  Bitte eine der angezeigten Zahlen eingeben.'));
  }
}
