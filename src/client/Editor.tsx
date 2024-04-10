import React, {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import { MenuItem } from './Menu.js';
import * as util from './util.jsx';
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
};

export type EditorContext = {
  // toggleCheckboxStyle: () => any;
  // toggleBulletpointStyle: () => any;
  cycleListStyle: () => any;
  focus: () => any;
};

type Selection = { start: number; end: number; direction: 'forward' | 'backward' | 'none' };

export const Editor = forwardRef(function Editor(props: EditorProps, ref: React.ForwardedRef<EditorContext>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0, direction: 'forward' });
  const [lastSelection, setLastSelection] = useState<Selection | undefined>();

  function replaceText(deleteStart: number, deleteEnd: number, text?: string) {
    const textarea = textareaRef.current!;
    textarea.focus();
    let cur = textarea.selectionStart;
    textarea.setSelectionRange(deleteStart, deleteEnd);

    if (deleteStart < deleteEnd) {
      document.execCommand('delete');
    }
    if (text) {
      document.execCommand('insertText', false, text);
    }

    const newSelection = cutil.calcNewSelection(cur, deleteStart, deleteEnd, text?.length ?? 0);
    textarea.setSelectionRange(newSelection, newSelection);
  }

  // function toggleCheckboxStyle() {
  //   const textarea = textareaRef.current!;
  //   let text = textarea.value;
  //   let cur = textarea.selectionStart;
  //   const line = cutil.parseLine(text, cur);
  //   textarea.focus();

  //   if (line.checkbox) {
  //     replaceText(line.start + line.padding, line.bodyStart);
  //   } else if (line.bullet) {
  //     replaceText(line.contentStart + 2, line.contentStart + 2, '[ ] ');
  //   } else if (!lastSelection) {
  //     replaceText(text.length, text.length, text.length > 0 ? '\n- [ ] ' : '- [ ] ');
  //     textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  //   } else {
  //     replaceText(line.contentStart, line.contentStart, '- [ ] ');
  //   }
  // }

  // function toggleBulletpointStyle() {
  //   const textarea = textareaRef.current!;
  //   let text = textarea.value;
  //   let cur = textarea.selectionStart;
  //   const line = cutil.parseLine(text, cur);
  //   textarea.focus();
  //   if (line.checkbox) {
  //     replaceText(line.contentStart + 2, line.contentStart + 6);
  //   } else if (line.bullet) {
  //     replaceText(line.start + line.padding, line.bodyStart);
  //   } else if (cur === 0) {
  //     replaceText(text.length, text.length, text.length > 0 ? '\n- ' : '- ');
  //   } else {
  //     replaceText(line.contentStart, line.contentStart, '- ');
  //   }
  // }

  function cycleListStyle() {
    const textarea = textareaRef.current!;
    let text = textarea.value;
    let cur = textarea.selectionStart;
    const line = cutil.parseLine(text, cur);

    // unstyled -> checkbox -> bulletpoint ...

    if (line.checkbox) {
      replaceText(line.contentStart + 2, line.contentStart + 6);
    } else if (line.bullet) {
      replaceText(line.start + line.padding, line.bodyStart);
    } else if (!lastSelection) {
      replaceText(text.length, text.length, text.length > 0 ? '\n- [ ] ' : '- [ ] ');
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    } else {
      replaceText(line.contentStart, line.contentStart, '- [ ] ');
    }
  }

  function focus() {
    textareaRef.current!.focus();
  }

  useImperativeHandle<EditorContext, EditorContext>(ref, () => ({ cycleListStyle, focus }), [cycleListStyle, focus]);

  function changeCb() {
    props.onChange(textareaRef.current!.value);
  }

  function keyDownCb(e: React.KeyboardEvent) {
    const textarea = textareaRef.current!;
    let text = textarea.value;
    let cur = textarea.selectionStart;
    if (e.key === 'Enter' && !e.shiftKey) {
      textarea.focus();

      const line = cutil.parseLine(text, cur);
      if (cur < line.bodyStart) return;

      if (line.bullet) {
        e.preventDefault();
        if (line.body === '') {
          textarea.setSelectionRange(line.start, line.end);
          document.execCommand('delete');
        } else if (line.checkbox) {
          document.execCommand('insertText', false, '\n' + ' '.repeat(line.padding) + line.bullet + ' [ ] ');
        } else {
          document.execCommand('insertText', false, '\n' + ' '.repeat(line.padding) + line.bullet + ' ');
        }
      } else if (line.padding) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n' + ' '.repeat(line.padding));
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
    let text = textarea.value;
    let cur = textarea.selectionDirection === 'forward' ? textarea.selectionEnd : textarea.selectionStart;
    const line = cutil.parseLine(text, cur);

    if (line.checkbox && cur >= line.contentStart + 2 && cur < line.bodyStart) {
      textarea.setSelectionRange(line.contentStart, line.bodyStart);
      document.execCommand('insertText', false, line.bullet + ' ' + (line.checked ? '[ ] ' : '[x] '));
      textarea.setSelectionRange(lastSelection!.start, lastSelection!.end, lastSelection!.direction);
    }
  }

  const { onClick, onMouseDown } = util.useClickWithoutDrag(clickCb);

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

// export function createInsertMenu(getCtx: () => EditorContext): MenuItem[] {
//   return [
//     { label: 'Checkbox', icon: '/icons/checkbox-filled.svg', onClick: () => getCtx().toggleCheckboxStyle() },
//     { label: 'Bullet point', icon: '/icons/bulletpoint.svg', onClick: () => getCtx().toggleBulletpointStyle() },
//   ];
// }
