import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import LoginPage from './LoginPage.jsx';
import NotesPage from './NotesPage.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

export default function App() {
  const app = appStore.use();

  useSyncOnlineStatus();
  useSyncStorage();

  if (!app.user) {
    return <LoginPage />;
  }

  return <NotesPage />;
}

function useSyncOnlineStatus() {
  useEffect(() => {
    function callback() {
      appStore.update(app => {
        app.online = navigator.onLine;
      });
      if (navigator.onLine) {
        storage.sync();
      }
    }
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);
}

function useSyncStorage() {
  // Listen to storage's sync events and update notes.
  useEffect(() => {
    function syncListener(args: storage.SyncListenerArgs) {
      console.log('syncListener: ', args);
      // Only update error message if syncing has ended because listener is also called
      // when a new sync starts.
      appStore.update(app => {
        app.syncing = !args.done;
        if (args.done) {
          app.errorMsg = args.error?.message;
          actions.updateNotes();
        }
      });
    }
    storage.addSyncListener(syncListener);
    return () => storage.removeSyncListener(syncListener);
  }, []);
}
