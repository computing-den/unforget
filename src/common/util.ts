import type * as t from './types.js';

export const CACHE_VERSION = 75;

export function isNoteNewerThan(a: t.NoteHead, b?: t.NoteHead): boolean {
  return (
    !b || a.modification_date > b.modification_date || (a.modification_date === b.modification_date && a.id > b.id)
  );
}

export function escapeRegExp(str: string): string {
  // Taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function findBeginningOfLine(text: string, cur: number): number {
  while (cur > 0 && text[cur - 1] !== '\n') cur--;
  return cur;
}

export function findEndOfLine(text: string, cur: number): number {
  while (cur < text.length && text[cur] !== '\r' && text[cur] !== '\n') cur++;
  return cur;
}

export function parseLine(text: string, cur: number): t.ParsedLine {
  const isLookingAt = (sub: string) => text.startsWith(sub, cur);
  const start = findBeginningOfLine(text, cur);
  const end = findEndOfLine(text, cur);
  const lastLine = !text[end];

  cur = skipWhitespaceSameLine(text, start);
  const padding = cur - start;
  const contentStart = cur;

  let bullet = '';
  if (isLookingAt('- ') || isLookingAt('+ ')) {
    bullet = text[cur];
    cur += 2;
  }

  const checked = Boolean(bullet) && (isLookingAt('[x] ') || isLookingAt('[X] '));
  const checkbox = Boolean(bullet) && (checked || isLookingAt('[ ] '));
  if (checkbox) cur += 4;

  const body = text.substring(cur, end);
  const bodyStart = cur;
  const wholeLine = text.substring(start, end);

  return { wholeLine, padding, bullet, checkbox, checked, start, end, body, bodyStart, contentStart, lastLine };
}

export function parseLines(text: string): t.ParsedLine[] {
  const lines: t.ParsedLine[] = [];
  let cur = 0;
  while (cur < text.length) {
    const line = parseLine(text, cur);
    lines.push(line);
    cur = line.end + 1;
  }
  return lines;
}

// function isLookingAtCheckbox(text: string, cur: number): boolean {
//   return isLookingAtBullet(text, cur)
//   return text.startsWith('- [ ] ', cur) || text.startsWith('- [x] ', cur) || text.startsWith(' - [X] ', cur);
// }

// function isLookingAtBullet(text: string, cur: number): boolean {
//   return text.startsWith('- ', cur) || text.startsWith('+ ', cur);
// }

// function getCheckboxBody(text: string, startOfCheckbox: number): string {
//   if (!isLookingAtCheckbox(text, startOfCheckbox)) throw new Error('expected start of checkbox');
//   return text.substring(startOfCheckbox + '- [ ] '.length, findEndOfLine(text, startOfCheckbox));
// }

export function skipWhitespaceSameLine(text: string, cur: number): number {
  while ((cur < text.length && text[cur] === ' ') || text[cur] === '\t') cur++;
  return cur;
}

export function insertText(text: string, segment: string, start: number, end?: number): string {
  return text.substring(0, start) + segment + text.substring(end ?? start);
}

export function toggleLineCheckbox(line: t.ParsedLine): string {
  return ' '.repeat(line.padding) + line.bullet + ' ' + (line.checked ? '[ ] ' : '[x] ') + line.body;
}

export function calcNewSelection(
  origSelection: number,
  deleteStart: number,
  deleteEnd: number,
  insertLength: number,
): number {
  if (origSelection < deleteStart) return origSelection;

  origSelection = Math.max(origSelection, deleteEnd);
  const deleteLength = deleteEnd - deleteStart;
  const added = insertLength - deleteLength;
  return origSelection + added;
}

export function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function hexStringToBytes(str: string): Uint8Array {
  if (str.length % 2) throw new Error('hexStringToBytes invalid string');
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < str.length; i += 2) {
    bytes[i / 2] = parseInt(str.substring(i, i + 2), 16);
  }
  return bytes;
}

export class ServerError extends Error {
  constructor(
    message: string,
    public code: number,
    public type: t.ServerErrorType = 'generic',
  ) {
    super(message);
  }

  static fromJSON(json: any): ServerError {
    return new ServerError(json.message, json.code, json.type);
  }
}
