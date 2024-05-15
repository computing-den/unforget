import _ from 'lodash';

// space type space checkbox space content
const ulRegExp =
  /^(?<space1>\ *)((?<type>[\*+-])(?<space2>\ +)((?<checkbox>\[[xX ]\])(?<space3>\ +))?)(?<content>.*)$/m;
const olRegExp =
  /^(?<space1>\ *)((?<type>\d+[\.\)])(?<space2>\ +)((?<checkbox>\[[xX ]\])(?<space3>\ +))?)(?<content>.*)$/m;
const lineRegExp = /^(?<space1>\ *)(?<content>.*)$/m;

export type Range = { start: number; end: number };
export type ListItem = {
  space1: string;
  type: string;
  space2: string;
  checkbox: string;
  space3: string;
  content: string;
};

// export function toggleIfOnCheckbox(text: string, i: number): string {
//   const lineRange = getLineRangeAt(text, i);
//   const line = getLine(text, lineRange);
//   let listItem = parseListItem(line);
//   if (listItem && isCursorOnCheckbox(listItem, i - lineRange.start)) {
//     listItem = toggleListItemCheckbox(listItem);
//     return insertText(text, stringifyListItem(listItem), lineRange);
//   }

//   return text;
// }

/**
 * i is relative to the start of listItem
 */
export function isCursorOnCheckbox(l: ListItem, i: number) {
  const checkboxPos = l.space1.length + l.type.length + l.space2.length;
  return l.checkbox && i >= checkboxPos && i < checkboxPos + 4;
}

export function toggleListItemCheckbox(l: ListItem): ListItem {
  return { ...l, checkbox: l.checkbox === '[ ]' ? '[x]' : '[ ]' };
}

export function removeListItemCheckbox(l: ListItem): ListItem {
  // '- [ ] task' -> '- task'
  return { space1: l.space1, type: l.type, space2: ' ', checkbox: '', space3: '', content: l.content };
}

export function addListItemCheckbox(l: ListItem): ListItem {
  // 'task' -> '- [ ]  task'
  // '-  task' -> '- [ ]  task'
  return { space1: l.space1, type: l.type || '-', space2: ' ', checkbox: '[ ]', space3: ' ', content: l.content };
}

export function removeListItemType(l: ListItem): ListItem {
  // '-  task' -> 'task'
  // '-  [ ] task' -> 'task'
  return { space1: l.space1, type: '', space2: '', checkbox: '', space3: '', content: l.content };
}

// /**
//  * unstyled -> checkbox -> bulletpoint ...
//  */
// export function cycleListItem(l: ListItem): ListItem {
//   if (l.checkbox) {
//   } else if (l.type) {
//   } else {
//   }
//   return { ...l, checkbox: l.checkbox === '[ ]' ? '[x]' : '[ ]' };
// }

export function parseListItem(line: string): ListItem {
  let match = line.match(ulRegExp) ?? line.match(olRegExp) ?? line.match(lineRegExp);
  const { space1 = '', type = '', space2 = '', checkbox = '', space3 = '', content = '' } = match!.groups as any;
  return { space1, type, space2, checkbox, space3, content };
}

/**
 * Resulting range is relative to the given list item.
 */
export function getListItemCheckboxRange(l: ListItem): Range {
  const start = l.space1.length + l.type.length + l.space2.length;
  return { start, end: start + l.checkbox.length };
}

export function stringifyListItem(l: ListItem): string {
  return stringifyListItemPrefix(l) + l.content;
}

export function stringifyListItemPrefix(l: ListItem): string {
  return l.space1 + l.type + l.space2 + l.checkbox + l.space3;
}

export function insertText(text: string, segment: string, range: Range): string {
  return text.substring(0, range.start) + segment + text.substring(range.end);
}

export function getLineRangeAt(text: string, i: number): Range {
  return { start: getLineStart(text, i), end: getLineEnd(text, i) };
}

export function getLine(text: string, range: Range): string {
  return text.substring(range.start, range.end);
}

function getLineStart(text: string, i: number): number {
  while (i > 0 && text[i - 1] !== '\n') i--;
  return i;
}

function getLineEnd(text: string, i: number): number {
  while (i < text.length && text[i] !== '\r' && text[i] !== '\n') i++;
  return i;
}
