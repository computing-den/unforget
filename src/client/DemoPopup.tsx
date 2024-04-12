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
import * as util from './util.jsx';
import _ from 'lodash';

export function DemoPopup() {
  return (
    <div className="demo-popup">
      <div className="outer-container">
        <div className="inner-container">DEMO</div>
      </div>
    </div>
  );
}
