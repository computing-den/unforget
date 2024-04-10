import type * as t from '../common/types.js';
import { createRoot } from 'react-dom/client';
import * as storage from './storage.js';
import { setUpManualScrollRestoration, patchHistory } from './router.jsx';
import * as util from './util.jsx';
import React from 'react';
import App from './App.jsx';
import * as appStore from './appStore.jsx';
import * as actions from './appStoreActions.jsx';
import { ServerError } from '../common/util.js';
import log from './logger.js';

async function setup() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/serviceWorker.js').then(
      registration => {
        log('window: service worker registration successful:', registration);
      },
      error => {
        log.error(`window: service worker registration failed: ${error}`);
      },
    );

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.command === 'refreshPage') {
        log('window: received refreshPage from service worker client');
        // window.location.reload();
        appStore.update(app => {
          app.requirePageRefresh = true;
        });
      }
    });
  } else {
    log.error('window: service workers are not supported.');
  }

  await actions.initAppStore();
  await actions.makeSureConsistentUserAndCookie();

  // Sync online status.
  function onlineChanged() {
    appStore.update(app => {
      app.online = navigator.onLine;
    });
  }
  window.addEventListener('online', onlineChanged);
  window.addEventListener('offline', onlineChanged);

  // Sync with server when online.
  window.addEventListener('online', () => {
    storage.sync();
  });

  // Sync with server periodically.
  setInterval(storage.sync, 5000);

  // Initial sync with server.
  storage.sync();

  // Listen to server sync events and update notes if there are any changes from the server.
  storage.addSyncListener(async function syncListener(args: storage.SyncListenerArgs) {
    appStore.update(app => {
      app.syncing = !args.done;
    });
    if (args.done && args.error) {
      if (args.error instanceof TypeError) {
        // TypeError is thrown when device is offline or server is down or there's a Cors problem etc.
        // Should be ignored.
      } else if (args.error instanceof ServerError && args.error.code === 401) {
        await actions.resetUser();
      } else {
        actions.showMessage(`Sync failed: ${args.error.message}`, { type: 'error' });
      }
    }

    if (args.done && args.mergeCount > 0) actions.updateNotes();
  });

  // Check for app updates when page becomes visible.
  window.addEventListener('visibilitychange', function visibilityChanged() {
    if (document.visibilityState === 'visible') {
      actions.checkAppUpdate();
    }
  });

  // Check for app updates when online.
  window.addEventListener('online', actions.checkAppUpdate);

  // Check for app updates periodically.
  setInterval(actions.checkAppUpdate, 10 * 1000);

  // Initial check for app updates.
  actions.checkAppUpdate();

  // Update queue count periodically.
  setInterval(actions.updateQueueCount, 3 * 1000);

  // Notify user if app updated.
  actions.notifyIfAppUpdated();

  // Manual scroll restoration.
  setUpManualScrollRestoration();

  // Patch history required for our router.
  patchHistory();

  const root = createRoot(document.getElementById('app')!);
  root.render(<App />);
}

window.onload = setup;
