import React, { memo, useState } from 'react';
import type * as t from '../common/types.js';
import { assert } from '../common/util.js';
import * as md from '../common/mdFns.js';
// import * as actions from './appStoreActions.jsx';
import { useClickWithoutDrag } from './hooks.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
import { toHtml } from 'hast-util-to-html';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { visit } from 'unist-util-visit';
import { visitParents } from 'unist-util-visit-parents';
import { newlineToBreak } from 'mdast-util-newline-to-break';

export function Notes(props: {
  notes: t.Note[];
  readonly?: boolean;
  onHashLinkClick?: (hash: string) => any;
  onNoteChange?: (note: t.Note) => any;
  onNoteClick?: (note: t.Note) => any;
  onToggleNoteSelection?: (note: t.Note) => any;
  hiddenNoteId?: string;
  hideContentAfterBreak?: boolean;
  noteSelection?: string[];
  selectable?: boolean;
}) {
  const notes = props.notes.filter(n => n.id !== props.hiddenNoteId);
  return (
    <div className={`notes ${props.noteSelection ? 'has-selection' : ''} ${props.selectable ? 'selectable' : ''}`}>
      {notes.map(note => (
        <Note
          key={note.id}
          note={note}
          readonly={props.readonly}
          onHashLinkClick={props.onHashLinkClick}
          onNoteChange={props.onNoteChange}
          onNoteClick={props.onNoteClick}
          onToggleNoteSelection={props.onToggleNoteSelection}
          hideContentAfterBreak={props.hideContentAfterBreak}
          selected={props.noteSelection?.includes(note.id)}
        />
      ))}
    </div>
  );
}

export const Note = memo(function Note(props: {
  note: t.Note;
  readonly?: boolean;
  onHashLinkClick?: (hash: string) => any;
  onNoteChange?: (note: t.Note) => any;
  onNoteClick?: (note: t.Note) => any;
  onToggleNoteSelection?: (note: t.Note) => any;
  hideContentAfterBreak?: boolean;
  selected?: boolean;
}) {
  // Do not modify the text here because we want the position of each element in mdast and hast to match
  // exactly the original text.
  const text = props.note.text;

  const [expanded, setExpanded] = useState(false);

  function toggleExpanded(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(!expanded);
    if (expanded) {
      setTimeout(() => {
        const elem = document.getElementById(props.note.id);
        if (elem) window.scrollTo({ top: elem.getBoundingClientRect().top + window.scrollY - 50, behavior: 'smooth' });
      }, 0);
    }
  }

  function clickCb(e: React.MouseEvent) {
    // history.pushState(null, '', `/n/${props.note.id}`);
    const elem = e.target as HTMLElement;
    const link = elem.closest('a');
    const input = elem.closest('input');
    const li = elem.closest('li');
    if (input && li && !props.readonly) {
      e.preventDefault();
      e.stopPropagation();

      const [start, end] = [Number(li.dataset.posStart), Number(li.dataset.posEnd)];
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        console.error(`Got unknown start or end position for li: ${start}, ${end}`);
        return;
      }

      // console.log('checkbox at li:', start, end);
      // console.log('text:', `<START>${text!.substring(start, end)}<END>`);

      const liText = text!.substring(start, end);
      const ulCheckboxRegExp = /^(\s*[\*+-]\s*\[)([xX ])(\].*)$/m;
      const olCheckboxRegExp = /^(\s*\d+[\.\)]\s*\[)([xX ])(\].*)$/m;
      const match = liText.match(ulCheckboxRegExp) ?? liText.match(olCheckboxRegExp);
      if (!match) {
        console.error(`LiText did not match checkbox regexp: `, liText);
        return;
      }
      const newLi = match[1] + (match[2] === ' ' ? 'x' : ' ') + match[3];

      const newText = md.insertText(text!, newLi, { start, end: start + match[0].length });
      const newNote: t.Note = { ...props.note, text: newText, modification_date: new Date().toISOString() };
      props.onNoteChange?.(newNote);
    } else if (link) {
      const baseURL = new URL(document.baseURI);
      const targetURL = new URL(link.href, document.baseURI);
      const isRelative = baseURL.origin === targetURL.origin;

      if (isRelative) {
        e.preventDefault();
        e.stopPropagation();
        if (baseURL.pathname === targetURL.pathname && baseURL.hash !== targetURL.hash) {
          props.onHashLinkClick?.(targetURL.hash);
        } else {
          history.pushState(null, '', link.href);
        }
      } else {
        e.stopPropagation();
      }
    } else {
      props.onNoteClick?.(props.note);
    }
  }

  const { onClick, onMouseDown } = useClickWithoutDrag(clickCb);

  function selectCb(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    props.onToggleNoteSelection?.(props.note);
  }

  // function inputClickCb(e: React.MouseEvent) {
  //   e.preventDefault();
  //   e.stopPropagation();
  // }

  const mdast = fromMarkdown(text ?? '', {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  newlineToBreak(mdast);
  // console.log('mdast', mdast);
  assert(mdast.type === 'root', 'hast does not have root');
  const noteIsEmpty = mdast.children.length === 0;

  // Turn the first line into a heading if it's not already a heading and it is followed by two new lines
  {
    const first = mdast.children[0];
    if (first?.type === 'paragraph' && text?.match(/^[^\r\n]+\r?\n\r?\n/g)) {
      mdast.children[0] = { type: 'heading', depth: 1, position: first.position, children: first.children };
    }
  }

  // Remove everything after thematicBreak
  const breakMdNodeIndex = mdast.children.findIndex(node => node.type === 'thematicBreak');
  if (props.hideContentAfterBreak && !expanded && breakMdNodeIndex !== -1) {
    mdast.children.splice(breakMdNodeIndex);
  }

  const hast = toHast(mdast);
  // console.log(hast);

  const baseURL = new URL(document.baseURI);
  visit(hast, 'element', function (node) {
    // Enable input nodes.
    if (node.tagName === 'input') {
      node.properties['disabled'] = Boolean(props.readonly);
    }

    // Set external links' target to '_blank'.
    if (node.tagName === 'a' && typeof node.properties['href'] === 'string') {
      const targetURL = new URL(node.properties['href'], document.baseURI);
      if (baseURL.origin !== targetURL.origin) {
        node.properties['target'] = '_blank';
      }
    }

    // Set start and end position of all elements.
    node.properties['data-pos-start'] = node.position?.start.offset;
    node.properties['data-pos-end'] = node?.position?.end.offset;
  });

  const html = toHtml(hast);

  return (
    <div
      id={props.note.id}
      className={`note ${props.onNoteClick ? 'clickable' : ''} ${props.selected ? 'selected' : ''} ${
        props.note.pinned ? 'pinned' : ''
      }`}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {Boolean(props.note.pinned) && <img className="pin" src={icons.pinFilled} />}
      {noteIsEmpty ? (
        <div>
          <h2 className="empty">Empty note</h2>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {props.hideContentAfterBreak && breakMdNodeIndex >= 0 && (
        <p>
          <a href="#toggle-expand" onClick={toggleExpanded}>
            {expanded ? 'show less' : 'show more'}
          </a>
        </p>
      )}
      <div className={`select ${props.selected ? 'selected' : ''}`} tabIndex={0} onClick={selectCb}>
        <div className="circle">
          <img src={icons.check} />
        </div>
      </div>
    </div>
  );
});
