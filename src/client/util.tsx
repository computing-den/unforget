import type * as t from '../common/types.js';
import * as cutil from '../common/util.js';
import React, { useCallback, useState, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

export async function createFetchResponseError(res: Response): Promise<Error> {
  const contentType = getResponseContentType(res);
  if (contentType === 'application/json') {
    return new Error((await res.json()).message || 'unknown');
  } else {
    console.error(await res.text());
    return new Error(`unknown response of type ${contentType}`);
  }
}

function getResponseContentType(res: Response): string | undefined {
  return res.headers.get('Content-Type')?.split(/\s*;\s*/g)[0];
}

export async function postApi<T>(pathname: string, json?: any): Promise<T> {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json && JSON.stringify(json),
  });
  if (!res.ok) throw await createFetchResponseError(res);
  return await res.json();
}

export function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')[1];
}

// TODO get from indexeddb
// export function getUserFromCookie(): t.LocalUser | undefined {
//   const username = getCookie('unforget_username');
//   const token = getCookie('unforget_token');
//   console.log('getUserFromCookie: ', username, token);
//   if (username && token) return { username, token };
// }

export function getUserTokenFromCookie(): string | undefined {
  return getCookie('unforget_token');
}

export function resetUserCookies() {
  // document.cookie = 'unforget_username=; path=/';
  document.cookie = 'unforget_token=; path=/';
}

export function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const interval = setInterval(cb, ms);
    return () => clearInterval(interval);
  }, []);
}

export function useCallbackCancelEvent(cb: () => any, deps: React.DependencyList): (e?: React.UIEvent) => void {
  return useCallback((e?: React.UIEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    cb();
  }, deps);
}

// export function useLocation(): Location {
//   return useSyncExternalStore(subscribeToPopstate, () => window.location);
// }

// function subscribeToPopstate(cb: () => void): () => void {
//   window.addEventListener('popstate', cb);
//   return () => window.removeEventListener('popstate', cb);
// }

export function useScrollToTop() {
  useLayoutEffect(() => {
    document.documentElement.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  }, []);
}

export function useClickWithoutDrag(cb: React.MouseEventHandler): {
  onClick: React.MouseEventHandler;
  onMouseDown: React.MouseEventHandler;
} {
  const [mouseDownPos, setMouseDownPos] = useState<[number, number] | undefined>();
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setMouseDownPos([e.clientX, e.clientY]);
  }, []);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (mouseDownPos) {
        const diff = [Math.abs(e.clientX - mouseDownPos[0]), Math.abs(e.clientY - mouseDownPos[1])];
        const dist = Math.sqrt(diff[0] ** 2 + diff[1] ** 2);
        if (dist < 5) return cb(e);
      }
    },
    [cb],
  );

  return { onClick, onMouseDown };
}

/**
 * Derive from username, password, and a static random number
 */
export async function calcClientPasswordHash({ username, password }: t.UsernamePassword): Promise<string> {
  const text = username + password + '32261572990560219427182644435912532';
  const encoder = new TextEncoder();
  const textBuf = encoder.encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', textBuf);
  return bytesToBase64DataUrl(hashBuf);
}

export function generateEncryptionSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(16));
}

export function generateIV(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

export async function bytesToBase64(bytes: ArrayBuffer): Promise<string> {
  const dataUrl = await bytesToBase64DataUrl(bytes);
  return await dataUrlToText(dataUrl);
}

export async function bytesToBase64DataUrl(bytes: ArrayBuffer, type = 'application/octet-stream'): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result as string),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(new File([bytes], '', { type }));
  });
}

export async function dataUrlToBytes(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export async function dataUrlToText(dataUrl: string): Promise<string> {
  // NOTE: Apparently, data urls generated in node may have more commas.
  const segments = dataUrl.split(',');
  if (segments.length != 2) throw new Error('dataUrlToText received unexpected input');
  return segments[1];
}
