import type * as t from '../common/types.js';
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

export function getUserFromCookie(): t.LocalUser | undefined {
  const username = getCookie('unforget_username');
  const token = getCookie('unforget_token');
  console.log('getUserFromCookie: ', username, token);
  if (username && token) return { username, token };
}

export function resetUserCookies() {
  document.cookie = 'unforget_username=; path=/';
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
