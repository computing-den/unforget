import React, { useState, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import * as md from '../common/mdFns.js';
import { MenuItem } from './Menu.js';
import { useClickWithoutDrag } from './hooks.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type EditorProps = {
  value: string;
  onChange: (value: string) => any;
  id?: string;
  className?: string;
  placeholder?: string;
  // autoFocus?: boolean;
  readOnly?: boolean;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
  autoExpand?: boolean;
  // onConfirm: () => any;
  // onDelete: () => any;
  // onTogglePinned: () => any;
};

export type EditorContext = {
  cycleListStyle: () => any;
  focus: () => any;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
};

type Selection = { start: number; end: number; direction: 'forward' | 'backward' | 'none' };

export const Editor = forwardRef(function Editor(props: EditorProps, ref: React.ForwardedRef<EditorContext>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0, direction: 'forward' });
  const [lastSelection, setLastSelection] = useState<Selection | undefined>();

  function replaceText(deleteStart: number, deleteEnd: number, text?: string) {
    const textarea = textareaRef.current!;
    textarea.focus();
    let i = textarea.selectionStart;
    textarea.setSelectionRange(deleteStart, deleteEnd);

    if (deleteStart < deleteEnd) {
      document.execCommand('delete');
    }
    if (text) {
      document.execCommand('insertText', false, text);
    }

    const newSelection = cutil.calcNewSelection(i, deleteStart, deleteEnd, text?.length ?? 0);
    textarea.setSelectionRange(newSelection, newSelection);
  }

  function replaceListItemPrefix(listItem: md.ListItem, newListItem: md.ListItem, lineRange: md.Range) {
    const linePrefix = md.stringifyListItemPrefix(listItem);
    const newLinePrefix = md.stringifyListItemPrefix(newListItem);
    replaceText(lineRange.start, lineRange.start + linePrefix.length, newLinePrefix);
  }

  function cycleListStyle() {
    const textarea = textareaRef.current!;
    const text = textarea.value;
    // If there's not lastSelection, assume end of text
    const i = textarea.selectionStart;
    const lineRange = md.getLineRangeAt(text, i);
    const line = md.getLine(text, lineRange);
    const listItem = md.parseListItem(line);

    // console.log('lastSelection', lastSelection);

    // unstyled -> checkbox -> bulletpoint ...
    if (listItem.checkbox) {
      replaceListItemPrefix(listItem, md.removeListItemCheckbox(listItem), lineRange);
    } else if (listItem.type) {
      replaceListItemPrefix(listItem, md.removeListItemType(listItem), lineRange);
      // } else if (!lastSelection) {
      //   replaceText(text.length, text.length, text.length > 0 ? '\n- [ ] ' : '- [ ] ');
      //   textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    } else {
      replaceListItemPrefix(listItem, md.addListItemCheckbox(listItem), lineRange);
    }

    textarea.focus();
    // If there were no lastSelection, move cursor to the end.
    // if (!lastSelection) {
    //   textarea.focus();
    //   textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    // }
  }

  function focus() {
    textareaRef.current!.focus();
  }

  useImperativeHandle<
    EditorContext,
    EditorContext
  >(ref, () => ({ cycleListStyle, focus, textareaRef }), [cycleListStyle, focus, textareaRef]);

  function changeCb() {
    props.onChange(textareaRef.current!.value);
  }

  function keyDownCb(e: React.KeyboardEvent) {
    const textarea = textareaRef.current!;

    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // textarea.focus();
      const text = textarea.value;
      const i = textarea.selectionStart;
      const lineRange = md.getLineRangeAt(text, i);
      const line = md.getLine(text, lineRange);
      const listItem = md.parseListItem(line);
      const listItemPrefix = md.stringifyListItemPrefix(listItem);

      // Ignore if cursor is before the line prefix
      if (i < lineRange.start + listItemPrefix.length) return;

      if (listItemPrefix) {
        e.preventDefault();
        if (!listItem.content) {
          // Pressing enter on a line with prefix and empty content will clear the prefix.
          textarea.setSelectionRange(lineRange.start, lineRange.end);
          document.execCommand('delete');
        } else {
          // Increment list item number and set empty checkbox.
          let newListItem = md.incrementListItemNumber(listItem);
          if (listItem.checkbox) {
            newListItem = md.setListItemCheckbox(newListItem, false);
          }

          // Delete whitespace and insert the prefix.
          const afterWhitespace = md.skipWhitespaceSameLine(text, i);
          textarea.setSelectionRange(i, afterWhitespace);
          document.execCommand('insertText', false, '\n' + md.stringifyListItemPrefix(newListItem));
        }
      }
    }
  }

  function selectCb() {
    const textarea = textareaRef.current!;
    setLastSelection(selection);
    setSelection({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
    });
  }

  function clickCb(e: React.MouseEvent) {
    const textarea = textareaRef.current!;
    const text = textarea.value;
    const i = textarea.selectionDirection === 'forward' ? textarea.selectionEnd : textarea.selectionStart;
    const lineRange = md.getLineRangeAt(text, i);
    const line = md.getLine(text, lineRange);
    let listItem = md.parseListItem(line);
    if (md.isCursorOnCheckbox(listItem, i - lineRange.start)) {
      const newListItem = md.toggleListItemCheckbox(listItem);
      const checkboxRange = md.getListItemCheckboxRange(listItem);
      textarea.setSelectionRange(checkboxRange.start + lineRange.start, checkboxRange.end + lineRange.start);
      document.execCommand('insertText', false, newListItem.checkbox);
      if (lastSelection) {
        textarea.setSelectionRange(lastSelection.start, lastSelection.end, lastSelection.direction);
      }
    }
  }

  const { onClick, onMouseDown } = useClickWithoutDrag(clickCb);

  useLayoutEffect(() => {
    if (props.autoExpand) {
      const editor = textareaRef.current!;
      const style = window.getComputedStyle(editor);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      editor.style.height = '0'; // Shrink it first.
      editor.style.height = `${editor.scrollHeight - padding}px`;
    }
  }, [props.value, props.autoExpand]);

  return (
    <textarea
      id={props.id}
      ref={textareaRef}
      className={`editor text-input ${props.className || ''}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onChange={changeCb}
      onKeyDown={keyDownCb}
      value={props.value}
      placeholder={props.placeholder}
      // autoFocus={props.autoFocus}
      readOnly={props.readOnly}
      onSelect={selectCb}
    />
  );
});
