import type * as t from './types.js';

export function isNoteNewerThan(a: t.NoteHead, b?: t.NoteHead): boolean {
  return (
    !b || a.modification_date > b.modification_date || (a.modification_date === b.modification_date && a.id > b.id)
  );
}

export function escapeRegExp(str: string): string {
  // Taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export const CACHE_VERSION = '26';
