import type * as t from '../common/types.js';
import { ServerError, bytesToHexString, hexStringToBytes } from '../common/util.js';
import { useRouter } from './router.jsx';
import React, { useCallback, useState, useEffect, useLayoutEffect, createContext, useContext } from 'react';

export async function createServerError(res: Response): Promise<ServerError> {
  const contentType = getResponseContentType(res);
  if (contentType === 'application/json') {
    return ServerError.fromJSON(await res.json());
  } else {
    console.error(await res.text());
    return new ServerError(`unknown response of type ${contentType}`, res.status);
  }
}

function getResponseContentType(res: Response): string | undefined {
  return res.headers.get('Content-Type')?.split(/\s*;\s*/g)[0];
}

export async function postApi<T>(pathname: string, json?: any): Promise<T> {
  const params = new URLSearchParams({ apiProtocol: '2' }).toString();
  const res = await fetch(`${pathname}?${params}`, {
    // const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json && JSON.stringify(json),
  });
  if (!res.ok) {
    const error = await createServerError(res);
    if (error.type === 'app_requires_update') {
      postMessageToServiceWorker({ command: 'update' });
    }
    throw error;
  }
  return await res.json();
}

export function postMessageToServiceWorker(message: any) {
  navigator.serviceWorker?.ready.then(readyRegistration => {
    readyRegistration.active?.postMessage(message);
  });
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

export function setUserCookies(token: string) {
  document.cookie = `unforget_token=${token}; path=/`;
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

// export function useScrollToTop() {
//   useLayoutEffect(() => {
//     document.documentElement.scrollTo({
//       top: 0,
//       left: 0,
//       behavior: 'instant',
//     });
//   }, []);
// }

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

export function useRestoreScrollY() {
  const { state } = useRouter();
  useEffect(() => {
    if (Number.isFinite(state?.scrollY)) {
      window.scrollTo(0, state!.scrollY!);
    }
  }, []);
}

/**
 * Derive from username, password, and a static random number
 */
export async function calcClientPasswordHash({ username, password }: t.UsernamePassword): Promise<string> {
  const text = username + password + '32261572990560219427182644435912532';
  const encoder = new TextEncoder();
  const textBuf = encoder.encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', textBuf);
  return bytesToHexString(new Uint8Array(hashBuf));
}

export function generateEncryptionSalt(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(16));
}

export function generateIV(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

export async function bytesToBase64(bytes: ArrayBuffer): Promise<string> {
  return await extractBase64FromDataUrl(await bytesToBase64DataUrl(bytes));
}

export async function bytesToBase64DataUrl(bytes: ArrayBuffer): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new File([bytes], '', { type: 'application/octet-stream' }));
  });
}

export async function dataUrlToBytes(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}

export async function extractBase64FromDataUrl(dataUrl: string): Promise<string> {
  // NOTE: Apparently, data urls generated in node may have more commas.
  const segments = dataUrl.split(',');
  if (segments.length != 2) throw new Error('extractBase64FromDataUrl received unexpected input');
  return segments[1];
}

export async function base64ToBytes(base64: string): Promise<ArrayBuffer> {
  return dataUrlToBytes(`data:application/octet-stream;base64,${base64}`);
}

export async function makeEncryptionKey(password: string, salt: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(password);
  const keyMaterial = await window.crypto.subtle.importKey('raw', keyData, 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ]);

  const saltBuf = hexStringToBytes(salt);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(data: BufferSource, key: CryptoKey): Promise<t.EncryptedData> {
  const iv = generateIV();
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const encrypted_base64 = await bytesToBase64(encrypted);
  return { encrypted_base64, iv: bytesToHexString(iv) };
}

export async function decrypt(data: t.EncryptedData, key: CryptoKey): Promise<ArrayBuffer> {
  const encryptedBytes = await base64ToBytes(data.encrypted_base64);
  const iv = hexStringToBytes(data.iv);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBytes);
}

export async function encryptNotes(notes: t.Note[], key: CryptoKey): Promise<t.EncryptedNote[]> {
  const start = Date.now();
  const res: t.EncryptedNote[] = [];
  for (const note of notes) {
    res.push(await encryptNote(note, key));
  }
  if (res.length) console.log(`encrypted ${res.length} notes in ${Date.now() - start}ms`);
  return res;
}

export async function encryptNote(note: t.Note, key: CryptoKey): Promise<t.EncryptedNote> {
  const data = new TextEncoder().encode(JSON.stringify(note));
  const encrypted = await encrypt(data, key);
  return { id: note.id, modification_date: note.modification_date, ...encrypted };
}

export async function decryptNotes(notes: t.EncryptedNote[], key: CryptoKey): Promise<t.Note[]> {
  const start = Date.now();
  const res: t.Note[] = [];
  for (const note of notes) {
    res.push(await decryptNote(note, key));
  }
  if (res.length) console.log(`decrypted ${res.length} notes in ${Date.now() - start}ms`);
  return res;
}

export async function decryptNote(note: t.EncryptedNote, key: CryptoKey): Promise<t.Note> {
  const decryptedData = await decrypt(note, key);
  const noteString = new TextDecoder().decode(decryptedData);
  return JSON.parse(noteString) as t.Note;
}
