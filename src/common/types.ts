import type { Draft } from 'immer';

export type Note = {
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

export type EncryptedNote = EncryptedData & {
  id: string;
  modification_date: string;
};

export type EncryptedData = {
  // The encrypted Note in base64 format
  encrypted_base64: string;

  // Initial vector, a random number, that was used for encrypting this specific note
  iv: string;
};

export type DBEncryptedNote = EncryptedNote & {
  username: string;
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
  notes: EncryptedNote[];
  syncNumber: number;
};

export type SyncHeadsData = {
  noteHeads: NoteHead[];
  syncNumber: number;
};

export type NoteHead = {
  id: string;
  modification_date: string;
};

export type DBNoteHead = NoteHead & {
  token: string;
};

export type DeltaSyncReq = SyncData;

export type DeltaSyncResNormal = {
  type: 'ok';
} & SyncData;

export type DeltaSyncResRequireQueueSync = {
  type: 'require_queue_sync';
};

export type DeltaSyncRes = DeltaSyncResNormal | DeltaSyncResRequireQueueSync;

export type QueueSyncReq = SyncHeadsData;

export type QueueSyncRes = SyncHeadsData;

export type ServerConfig = {
  port: number;
};

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
  noteSelection?: string[];
  // notesUpdateRequestTimestamp: number;
  // notesUpdateTimestamp: number;
  notePages: number;
  notePageSize: number;
  allNotePagesLoaded: boolean;
  user?: ClientLocalUser;
  message?: { text: string; type: 'info' | 'error'; timestamp: number };
  syncing: boolean;
  updatingNotes: boolean;
  queueCount: number;
  online: boolean;
  requirePageRefresh: boolean;
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
  bodyText: string;
  bodyStart: number;
  contentStart: number;
  lastLine: boolean;
};

export type ServerErrorJSON = {
  message: string;
  code: number;
  type: ServerErrorType;
};

export type ServerErrorType = 'app_requires_update' | 'generic';

export type HistoryState = {
  // fromNotesPage?: boolean;
};

export type ClientToServiceWorkerMessage = void;
// | { command: 'update' }
// | { command: 'sync'; queue?: boolean; debounced?: boolean }
// | { command: 'tellOthersToRefreshPage' }
// | { command: 'tellOthersNotesInStorageChanged' }
// | { command: 'sendSyncStatus' }
// | { command: 'newClient' };

export type ServiceWorkerToClientMessage =
  | { command: 'serviceWorkerActivated'; cacheVersion: number }
  // | { command: 'syncStatus'; syncing: boolean }
  // | { command: 'notesInStorageChangedExternally' }
  // | { command: 'refreshPage' }
  | { command: 'error'; error: string };
// | { command: 'resetUser' };

export type BroadcastChannelMessage =
  | { type: 'notesInStorageChanged'; unforgetContextId: string }
  | { type: 'refreshPage'; unforgetContextId: string };
