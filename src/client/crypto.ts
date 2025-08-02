import type * as t from '../common/types.js';
import { bytesToHexString, hexStringToBytes } from '../common/util.js';
import log from './logger.js';

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

export function generateEncryptionSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function generateIV(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(12));
}

export async function bytesToBase64(buffer: ArrayBuffer): Promise<string> {
  // Note: using FileReader.readAsDataURL() is about 30x slower.
  let binaryString = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  const res = btoa(binaryString);
  return res;
}

export async function base64ToBytes(base64: string): Promise<ArrayBuffer> {
  // Note: using await (await fetch(dataUrl)).arrayBuffer() is about 50x slower
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function makeEncryptionKey(password: string, salt: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey('raw', keyData, 'PBKDF2', false, ['deriveBits', 'deriveKey']);

  const saltBuf = hexStringToBytes(salt);
  return crypto.subtle.deriveKey(
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

export async function exportEncryptionKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importEncryptionKey(key: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', key, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export async function encrypt(data: BufferSource, key: CryptoKey): Promise<t.EncryptedData> {
  const iv = generateIV();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const encrypted_base64 = await bytesToBase64(encrypted);
  return { encrypted_base64, iv: bytesToHexString(iv) };
}

export async function decrypt(data: t.EncryptedData, key: CryptoKey): Promise<ArrayBuffer> {
  const encryptedBytes = await base64ToBytes(data.encrypted_base64);
  const iv = hexStringToBytes(data.iv);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBytes);
}

export async function encryptNotes(notes: t.Note[], key: CryptoKey): Promise<t.EncryptedNote[]> {
  const start = performance.now();
  const res: t.EncryptedNote[] = [];
  for (const note of notes) {
    res.push(await encryptNote(note, key));
  }
  if (res.length) log(`encrypted ${res.length} notes in ${performance.now() - start}ms`);
  return res;
}

export async function encryptNote(note: t.Note, key: CryptoKey): Promise<t.EncryptedNote> {
  const data = new TextEncoder().encode(JSON.stringify(note));
  const encrypted = await encrypt(data, key);
  return { id: note.id, modification_date: note.modification_date, ...encrypted };
}

export async function decryptNotes(notes: t.EncryptedNote[], key: CryptoKey): Promise<t.Note[]> {
  const start = performance.now();
  const res: t.Note[] = [];
  for (const note of notes) {
    res.push(await decryptNote(note, key));
  }
  if (res.length) log(`decrypted ${res.length} notes in ${performance.now() - start}ms`);
  return res;
}

export async function decryptNote(note: t.EncryptedNote, key: CryptoKey): Promise<t.Note> {
  const decryptedData = await decrypt(note, key);
  const noteString = new TextDecoder().decode(decryptedData);
  return JSON.parse(noteString) as t.Note;
}
