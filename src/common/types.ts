import type { Draft } from 'immer';

export type Note = {
  id: string;
  text: string | null;
  creation_date: string;
  modification_date: string;
  not_deleted: number; // 0 or 1
  not_archived: number; // 0 or 1
  pinned: number; // 0 or 1
  order: number;
};

export type DBNote = Note & {
  username: string;
};

export type ServerConfig = {
  port: number;
};

export type DBUser = {
  username: string;
  password_double_hash: string;
  password_salt: string;
  encryption_salt: string;
};

export type DBClient = {
  username: string;
  token: string;
  sync_number: number;
  last_activity_date: string;
};

export type SignupData = {
  username: string;
  password_client_hash: string;
  encryption_salt: string;
};

export type LoginData = {
  username: string;
  password_client_hash: string;
};

export type LoginResponse = {
  username: string;
  token: string;
  encryption_salt: string;
};

export type UsernamePassword = {
  username: string;
  password: string;
};

export type SyncData = {
  notes: Note[];
  syncNumber: number;
};

export type NoteHead = {
  id: string;
  modification_date: string;
};

export type DBNoteHead = NoteHead & {
  token: string;
};

export type PartialSyncReq = SyncData;

export type PartialSyncResNormal = {
  type: 'ok';
} & SyncData;

export type PartialSyncResRequireFullSync = {
  type: 'require_full_sync';
};

export type PartialSyncRes = PartialSyncResNormal | PartialSyncResRequireFullSync;

export type FullSyncReq = SyncData;

export type FullSyncRes = SyncData;

export type ServerUserClient = {
  username: string;
  token: string;
};

export type ClientLocalUser = {
  username: string;
  token: string;
  encryptionKey: CryptoKey;
};

export type AppStore = {
  hidePinnedNotes: boolean;
  showArchive: boolean;
  notes: Note[];
  search?: string;
  notesLastModificationTimestamp: number;
  notesLastUpdateTimestamp: number;
  notePages: number;
  notePageSize: number;
  allNotePagesLoaded: boolean;
  user?: ClientLocalUser;
  message?: { text: string; type: 'info' | 'error'; timestamp: number };
  syncing: boolean;
  queueCount: number;
  online: boolean;
};

export type AppStoreRecipe = (draft: Draft<AppStore>) => AppStore | void;
export type AppStoreListener = (newStore: AppStore, oldStore: AppStore) => void;

export type ParsedLine = {
  wholeLine: string;
  padding: number;
  bullet: string;
  checkbox: boolean;
  checked: boolean;
  start: number;
  end: number;
  body: string;
  bodyStart: number;
  contentStart: number;
  lastLine: boolean;
};
