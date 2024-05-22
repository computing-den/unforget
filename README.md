# Unforget

Unforget is a minimalist note-taking app featuring:

- [x] Import from Google Keep
- [x] Offline first
- [x] Priavcy first
- [x] Open source
- [x] End-to-end encrypted sync
- [x] Desktop, Mobile, Web
- [x] Markdown support
- [x] Self hosted and cloud options
- [x] One-click data export as JSON
- [x] Optional one-click installation
- [x] Progressive web app, no Electron.js
- [x] Public APIs, create your own client
- [ ] Import from Apple Notes, coming soon


*Unforget is made by [Computing Den](https://computing-den.com), a software company specializing in web technologies.*


# Optional installation

Use it directly in your browser or install:

| Browser         | Installation                |
|-----------------|-----------------------------|
| Chrome          | Install icon in the URL bar |
| Edge            | Install icon in the URL bar |
| iOS Safari      | Share → Add to Home Screen  |
| Android Browser | Menu → Add to Home Screen   |
| Desktop Safari  | *cannot install*            |
| Desktop Firefox | *cannot install*            |


# Public APIs - write your own client

Here, all paths are relative to either the official server at [https://unforget.computing-den.com](https://unforget.computing-den.com) or your own server if you're self hosting.

See [TODO](TODO) for example code in TypeScript, Python, C#, Java, and Go.

## Note Types

```
type Note = {

  // UUID version 4
  id: string;

  // Deleted notes have text: null
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

}

type EncryptedNote = {

  // UUID version 4
  id: string;

  // ISO 8601 format
  modification_date: string;
  
  // The encrypted Note in base64 format
  encrypted_base64: string;
  
  // Initial vector, a random number, that was used for encrypting this specific note
  iv: string;

}

```

The server only knows about ```EncryptedNote``` and never sees the actual ```Note```. So, the client must encrypt before sending to and decrypt after receiving notes from the server.

Side note: the reason for using number (0 and 1) instead of boolean is to make it easier to store notes in SQLite which doesn't support boolean. And the reason why some of these fields are flipped (```not_deleted``` instead of ```deleted```) is to facilitate the use of IndexedDB which doesn't support indexing by multiple keys in arbitrary order.


## Signup, Login, Logout

To sign up, send a POST request to ```/api/signup``` with a JSON payload of type ```SignupData```:

```
type SignupData = {
  username: string;
  password_client_hash: string;
  encryption_salt: string;
}
```

To log in, send a POST request to ```/api/login``` with a JSON payload of type ```LoginData```:

```
type LoginData = {
  username: string;
  password_client_hash: string;
}
```

In both cases, if the credentials are wrong you will receive a 401 error. Otherwise, the server will respond with ```LoginResponse``` and code 200:

```
type LoginResponse = {
  username: string;
  token: string;
  encryption_salt: string;
}
```

To log out, send a POST request to ```/api/login?token=TOKEN```

In the following sections, all the requests to the server must include the ```token``` either as a parameter in the URL (e.g. ```/api/partial-sync?token=XXX```) or as a cookie named ```unforget_token```.

Notice that we never send the raw password to the server. Instead we calculate its hash as ```password_client_hash``` which is derived from the username, password, and a static random number. It is important to use the exact same algorithm for calculating the hash if you want to be able to use the official Unforget client as well as your own. The ```encryption_salt``` is a random number used to derive the key for encryption and decryption of notes. It is stored on the server and provided on login.

See [TODO](TODO) to find out how to calculate the hash and pick the encryption salt in TypeScript, Python, C#, Java, and Go.

## Get Notes

Send a POST request to ```/api/get-notes?token=TOKEN``` to get all the notes. Optionally you can provide a JSON payload of type ```{ids: string[]}``` to get specific notes.

You will receive ```EncryptedNote[]```.

## Add Notes

Send a POST request to ```/api/add-notes?token=TOKEN``` with a JSON payload of type ```{notes: EncryptedNote[]}```.

## Sync

For a long-running client, instead of using [Get Notes](#get-notes) and [Add Notes](#add-notes), we can use sync in the following manner.

The client and the server each maintain a queue of changes to send to each other as well as a sync number. The exchange of these changes is called a **delta sync**.

The sync number is 0 at login and is incremented by each side only after all the received changes have been merged and stored. At the start of each delta sync, if their sync numbers differ, it indicates that something went wrong in the last delta sync and so they must do a queue sync.

A **queue sync** is when each side sends its sync number along with a list of IDs and modification dates of all the notes that it knows about. After a queue sync, both sides will know which changes the other side lacks and therefore can update their own queue and sync number.

When the sync number is 0 (immediately after login), the server will send all the notes in the first delta sync.

To perform a **delta sync**, send a POST request to ```/api/partial-sync?token=TOKEN``` with a JSON payload of type ```SyncData```:

```
type SyncData = {
  notes: EncryptedNote[];
  syncNumber: number;
}
```

If the server agrees with the ```syncNumber```, it will respond with ```PartialSyncResNormal``` which includes the changes stored on the server for that client since the last sync. Otherwise, the server will respond with ```PartialSyncResRequireFullSync``` requiring the client to initiate a queue sync.

```
type PartialSyncResNormal = {
  type: 'ok';
  notes: EncryptedNote[];
  syncNumber: number;
}

type PartialSyncResRequireFullSync = {
  type: 'require_full_sync';
}
```

To perform a **queue sync**, send a POST request to ```/api/queue-sync?token=TOKEN``` with a JSON payload of type ```SyncHeadsData``` including the heads of all the notes known by the client and its sync number. You will then receive another ```SyncHeadsData``` including the heads of all the notes known by the server for that user along with the server's sync number for that client.

```
type SyncHeadsData = {
  noteHeads: NoteHead[];
  syncNumber: number;
}

type NoteHead = {
  id: string;
  modification_date: string;
}
```

After a queue sync, each side updates its queue to include the changes the other side is mising as well as setting the new sync number to be the larger sync number + 1.

It is important that the client and the server agree on how the **merging** of the notes is done so that they end up with a consistent state. We say that note A must replace note B if ```A.id == B.id``` and ```A.modification_date > B.modification_date```.

## Encryption and Decryption

The details of encryption and decryption are more easily explained in code. See [TODO](TODO) for example code in TypeScript, Python, C#, Java, and Go.

## Error handling

All the API calls will return an object of type ```ServerError``` when encountering an error with a status code >= 400:

```
type ServerError {
  message: string;
  code: number;
  type: 'app_requires_update' | 'generic';
}
```

If you receive an error with type ```app_requires_update``` that indicates that you are using an older version of the API that is no longer supported.

# Development
npm run dev

# Production
npm run clean
npm run build
npm run start

# Deploy
See deployment files in deploy/

npm run clean
npm run build
npm run deploy example

