import type { Draft } from 'immer';

export type Note = {
  id: string;
  text?: string;
  creation_date: string;
  modification_date: string;
  deleted: number; // 0 or 1
  archived: number; // 0 or 1
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
  password_hash: string;
};

export type DBClient = {
  username: string;
  token: string;
  sync_number: number;
  last_activity_date: string;
};

export type Credentials = {
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

export type LocalUser = {
  username: string;
  token: string;
};

export type AppStore = {
  menuOpen: boolean;
  notes: Note[];
  user?: LocalUser;
  errorMsg?: string;
  syncing: boolean;
  queueCount: number;
  online: boolean;
};

export type AppStoreRecipe = (draft: Draft<AppStore>) => AppStore | void;
export type AppStoreListener = (newStore: AppStore, oldStore: AppStore) => void;
