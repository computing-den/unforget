import type * as t from './types.js';

export function isNoteNewerThan(a: t.NoteHead, b?: t.NoteHead): boolean {
  return (
    !b || a.modification_date > b.modification_date || (a.modification_date === b.modification_date && a.id > b.id)
  );
}
