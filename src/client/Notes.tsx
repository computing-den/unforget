import React, { memo } from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as util from './util.jsx';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import _ from 'lodash';
import * as icons from './icons.js';

export function Notes(props: { notes: t.Note[] }) {
  // const app = appStore.use();
  return (
    <div className="notes">
      {props.notes.map(note => (
        <Note key={note.id} note={note} />
      ))}
    </div>
  );
}

export const Note = memo(function Note(props: { note: t.Note }) {
  let text = props.note.text;
  // if (text && text.length > 1500) {
  //   text = text.substring(0, 1500) + '\n..........';
  // }
  const lineLimit = 30;
  if (text && countLines(text) > lineLimit) {
    text = text.split(/\r?\n/).slice(0, lineLimit).join('\n') + '\n..........';
  }
  // const titleBodyMatch = text?.match(/^([^\r\n]+)\r?\n\r?\n(.+)$/s);
  // let title = titleBodyMatch?.[1];
  // let body = titleBodyMatch?.[2] ?? text ?? '';
  const lines = cutil.parseLines(text ?? '');
  const hasTitle = lines.length > 2 && !lines[0].bullet && lines[1].wholeLine === '';

  function clickCb(e: React.MouseEvent) {
    history.pushState(null, '', `/n/${props.note.id}`);
  }

  const { onClick, onMouseDown } = util.useClickWithoutDrag(clickCb);

  function inputChangeCb(e: React.ChangeEvent<HTMLInputElement>) {
    const lineIndex = Number(e.target.dataset.lineIndex);
    const line = lines[lineIndex];
    const newLineText = cutil.setLineCheckbox(line, e.target.checked);
    const newText = cutil.insertText(props.note.text!, newLineText, line.start, line.end);
    const newNote: t.Note = { ...props.note, text: newText, modification_date: new Date().toISOString() };
    actions.saveNoteAndQuickUpdateNotes(newNote);
  }

  function inputClickCb(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function renderLine(line: t.ParsedLine, i: number): React.ReactNode {
    let res = [];

    if (hasTitle && i === 0) {
      // Render title.
      res.push(<span className="title">{lines[0].wholeLine}</span>);
    } else if (!hasTitle || i >= 2) {
      // Render body line.

      if (i > 0) res.push('\n');

      if (!line.bullet) {
        res.push(line.wholeLine);
      } else {
        res.push(' '.repeat(line.padding * 2));
        if (line.checkbox) {
          res.push(
            <input
              type="checkbox"
              key={`input-${props.note.id}-${i}`}
              onChange={inputChangeCb}
              onClick={inputClickCb}
              data-line-index={i}
              checked={line.checked}
            />,
          );
          res.push('  ');
        } else {
          res.push('●  ');
        }
        res.push(line.bodyText);
      }
    }

    return res;
  }

  // const bodyLines = hasTitle ? lines.slice(2) : lines;

  return (
    <pre className="note clickable prewrap" onMouseDown={onMouseDown} onClick={onClick}>
      {Boolean(props.note.pinned) && <img className="pin" src={icons.pinFilled} />}
      {lines.map(renderLine)}
    </pre>
  );
});

function countLines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') count++;
  return count;
}
