import type * as t from '../common/types.js';
import React, { useCallback, useState, useEffect } from 'react';

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
  if (username && token) return { username, token };
}

export function resetUserCookies() {
  document.cookie = 'unforget_username=';
  document.cookie = 'unforget_token=';
}

export function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const interval = setInterval(cb, ms);
    return () => clearInterval(interval);
  }, []);
}

export function useCallbackCancelEvent(cb: () => void, deps: React.DependencyList): (e: React.UIEvent) => void {
  return useCallback((e: React.UIEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cb();
  }, deps);
}
