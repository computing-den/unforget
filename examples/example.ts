import { webcrypto } from 'node:crypto';
import fs from 'node:fs';

type Note = {
  // UUID version 4
  id: string;

  // Deleted notes have null text
  text: string | null;

  // ISO 8601 format
  creation_date: string;

  // ISO 8601 format
  modification_date: string;

  // 0 means deleted, 1 means not deleted
  not_deleted: number;

  // 0 means archived, 1 means not archived
  not_archived: number;

  // 0 means not pinned, 1 means pinned
  pinned: number;

  // A higher number means higher on the list
  // Usually, by default it's milliseconds since the epoch
  order: number;
};

type EncryptedNote = {
  // UUID version 4
  id: string;

  // ISO 8601 format
  modification_date: string;

  // The encrypted Note in base64 format
  encrypted_base64: string;

  // Initial vector, a random number, that was used for encrypting this specific note
  iv: string;
};

type LoginData = {
  username: string;
  password_client_hash: string;
};

type SignupData = {
  username: string;
  password_client_hash: string;
  encryption_salt: string;
};

type LoginResponse = {
  username: string;
  token: string;
  encryption_salt: string;
};

// In addition to LoginResponse, we want to locally store the CryptoKey which is derived from
// the encryption salt and the raw password during login/signup and used for encryption/decryption.
// However, since CryptoKey is not directly serializable, we convert it to JsonWebKey and use
// importKey() to convert back later.
type Credentials = LoginResponse & { jwk: webcrypto.JsonWebKey };

const BASE_URL = 'https://unforget.computing-den.com';

async function main() {
  switch (process.argv[2]) {
    case 'signup': {
      const username = process.argv[3];
      const password = process.argv[4];
      if (!username || !password) usageAndExit();

      await signup(username, password);
      break;
    }
    case 'login': {
      const username = process.argv[3];
      const password = process.argv[4];
      if (!username || !password) usageAndExit();

      await login(username, password);
      break;
    }
    case 'create': {
      const text = process.argv[3];
      if (!text) usageAndExit();

      await createNote(text);
      break;
    }
    case 'get': {
      const id = process.argv[3];

      await getNote(id);
      break;
    }
    default:
      usageAndExit();
  }
  console.log('Success.');
}

function usageAndExit() {
  console.error(`
Usage: npx tsx example.ts COMMAND
Available commands:
  singup USERNAME PASSWORD
  login USERNAME PASSWORD
  create TEXT
  get [ID]
`);
  process.exit(1);
}

async function signup(username: string, password: string) {
  const salt = bytesToHexString(webcrypto.getRandomValues(new Uint8Array(16)));
  const hash = await calcPasswordHash(username, password);
  const data: SignupData = { username, password_client_hash: hash, encryption_salt: salt };
  const res = await post<LoginResponse>('/api/signup', data);
  const credentials = await createCredentials(res, password);
  writeCredentials(credentials);
}

async function login(username: string, password: string) {
  const hash = await calcPasswordHash(username, password);
  const data: LoginData = { username, password_client_hash: hash };
  const res = await post<LoginResponse>('/api/login', data);
  const credentials = await createCredentials(res, password);
  writeCredentials(credentials);
}

async function createNote(text: string) {
  const note: Note = {
    id: webcrypto.randomUUID(),
    text,
    creation_date: new Date().toISOString(),
    modification_date: new Date().toISOString(),
    not_deleted: 1,
    not_archived: 1,
    pinned: 0,
    order: Date.now(),
  };

  // Read the credentials and convert the key from JsonWebKey back to CryptoKey.
  const credentials = readCredentials();
  const key = await importKey(credentials);

  const encryptedNote = await encryptNote(note, key);
  await post(`/api/merge-notes`, { notes: [encryptedNote] }, credentials);
  console.log(`Created note with ID ${note.id}`);
}

async function getNote(id?: string) {
  // Read the credentials and convert the key from JsonWebKey back to CryptoKey.
  const credentials = readCredentials();
  const key = await importKey(credentials);

  // ids: [] would return no notes. ids: undefined or null would return everything.
  const ids = id ? [id] : null;
  const encryptedNotes = await post<EncryptedNote[]>(`/api/get-notes`, { ids }, credentials);

  if (encryptedNotes.length === 0) {
    console.log('Not found');
  } else {
    // Decrypt the received notes using the key.
    const notes = await Promise.all(encryptedNotes.map(x => decryptNote(x, key)));
    // Log to console.
    for (const note of notes) console.log(JSON.stringify(note, null, 2) + '\n');
  }
}

async function encryptNote(note: Note, key: webcrypto.CryptoKey): Promise<EncryptedNote> {
  // Encode the string to bytes.
  const data = new TextEncoder().encode(JSON.stringify(note));

  // Generate the initial vector (iv).
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  // Encrypt the bytes using the iv and the given key.
  const encrypted = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  // Encode as base64 to easily store in JSON.
  const encryptedBase64 = Buffer.from(encrypted).toString('base64');

  // Create the EncryptedNote object.
  return {
    id: note.id,
    modification_date: note.modification_date,
    encrypted_base64: encryptedBase64,
    iv: bytesToHexString(iv),
  };
}

async function decryptNote(encryptedNote: EncryptedNote, key: webcrypto.CryptoKey): Promise<Note> {
  // Decode the base64 string to bytes.
  const encryptedBytes = Buffer.from(encryptedNote.encrypted_base64, 'base64');

  // Decrypt the bytes using note's initial vector (iv) and the given key.
  const iv = hexStringToBytes(encryptedNote.iv);
  const decryptedBytes = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBytes);

  // Decode the decrypted bytes into string.
  const noteString = new TextDecoder().decode(decryptedBytes);

  // Parse the string to get the note JSON.
  return JSON.parse(noteString);
}

/**
 * Read the credentials from ./credentials.json
 */
function readCredentials(): Credentials {
  return JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
}

/**
 * Write the credentials to ./credentials.json.
 */
function writeCredentials(credentials: Credentials) {
  fs.writeFileSync('credentials.json', JSON.stringify(credentials, null, 2));
  console.log('Wrote credentials to ./credentials.json');
}

/**
 * Converts the JsonWebKey (credentials.jwk) which was exported from CryptoKey back to CryptoKey so
 * that it can be used for encrypting and decrypting notes.
 */
async function importKey(credentials: Credentials): Promise<CryptoKey> {
  return webcrypto.subtle.importKey('jwk', credentials.jwk, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

/**
 * It derives a PBKDF2 CryptoKey from the password and the res.encryption_salt for encrypting and decrypting notes.
 * The CryptoKey is then exported to JsonWebKey so that we can serialize it and store it in credentials.json.
 * Use importKey() to convert back to CryptoKey.
 */
async function createCredentials(res: LoginResponse, password: string): Promise<Credentials> {
  const keyData = new TextEncoder().encode(password);
  const keyMaterial = await webcrypto.subtle.importKey('raw', keyData, 'PBKDF2', false, ['deriveBits', 'deriveKey']);

  const saltBuf = hexStringToBytes(res.encryption_salt);
  const key = await webcrypto.subtle.deriveKey(
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

  const jwk = await webcrypto.subtle.exportKey('jwk', key);
  return { ...res, jwk };
}

/**
 * Send a POST request to BASE_URL and parse the resopnse as JSON.
 */
async function post<T>(pathname: string, body?: any, credentials?: Credentials): Promise<T> {
  const query = credentials ? `?token=${credentials.token}` : '';
  const url = `${BASE_URL}${pathname}${query}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * The password hash is derived from the username, password, and a specific static random number.
 * It is important to use the exact same method for calculating the hash if you wish the
 * credentials to work with the official unforget app.
 */
async function calcPasswordHash(username: string, password: string): Promise<string> {
  const text = username + password + '32261572990560219427182644435912532';
  const encoder = new TextEncoder();
  const textBuf = encoder.encode(text);
  const hashBuf = await webcrypto.subtle.digest('SHA-256', textBuf);
  return bytesToHexString(new Uint8Array(hashBuf));
}

/**
 * bytesToHexString(Uint8Array.from([1, 2, 3, 10, 11, 12])) //=> '0102030a0b0c'
 */
function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * hexStringToBytes('0102030a0b0c') //=> Uint8Array(6) [ 1, 2, 3, 10, 11, 12 ]
 */
function hexStringToBytes(str: string): Uint8Array {
  if (str.length % 2) throw new Error('hexStringToBytes invalid string');
  const bytes = new Uint8Array(str.length / 2);
  for (let i = 0; i < str.length; i += 2) {
    bytes[i / 2] = parseInt(str.substring(i, i + 2), 16);
  }
  return bytes;
}

main();
