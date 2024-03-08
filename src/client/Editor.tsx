import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
import * as util from './util.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type EditorProps = {
  value: string;
  onChange: (value: string) => any;
  onClick?: () => any;
  id?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
};

function Editor(props: EditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const changeCb = useCallback(() => {
    props.onChange(editorRef.current!.value);
  }, [props.onChange]);

  // const selectCb = useCallback(() => {
  // const message = `selectionChange: ${editorRef.current!.selectionStart} ${editorRef.current!.selectionEnd}`;
  // util.postApi('/api/log', { message });
  // console.log(message);
  // }, []);

  const clickCb = useCallback(() => {
    props.onClick?.();
    const message = `clickCb: ${editorRef.current!.selectionStart} ${editorRef.current!.selectionEnd}`;
    util.postApi('/api/log', { message });
    console.log(message);
  }, [props.onClick]);

  return (
    <textarea
      id={props.id}
      ref={editorRef}
      className={`editor text-input ${props.className || ''}`}
      onClick={clickCb}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onChange={changeCb}
      value={props.value}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      readOnly={props.readOnly}
      // onSelect={selectCb}
    />
  );

  // useEffect(() => {
  //   editorRef.current!.addEventListener("paste", function(e) {
  //     // cancel paste
  //     e.preventDefault();

  //     // get text representation of clipboard
  //     var text = e.clipboardData?.getData('text/plain');

  //     // insert text manually
  //     document.execCommand("insertHTML", false, text);
  //   });

  // }, [])

  // return (
  //   <pre
  //     ref={editorRef}
  //     className={`editor text-input ${props.className || ''}`}
  //     tabIndex={0}
  //     contentEditable
  //     onInput={changed}
  //   ></pre>
  // );
}

export default Editor;
