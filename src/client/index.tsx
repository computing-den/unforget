import type * as t from '../common/types.js';
import { createRoot } from 'react-dom/client';
import * as storage from './storage.js';
import { setUpManualScrollRestoration, patchHistory } from './router.jsx';
import React from 'react';
import App from './App.jsx';
import { postToServiceWorker } from './clientToServiceWorkerApi.js';
import * as appStore from './appStore.jsx';
import * as actions from './appStoreActions.jsx';
import { ServerError, CACHE_VERSION } from '../common/util.js';
import log from './logger.js';

async function setup() {
  // Set up storage before registering the service worker.
  // Because the service worker itself will try to set up the storage too.
  await storage.getStorage();

  // Register the service worker.
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/serviceWorker.js');
    log('window: service worker registration successful:', reg);
    // log.error(`window: service worker registration failed: ${error}`);

    navigator.serviceWorker.addEventListener('message', event => {
      log(`window: received message from service worker`, event.data);
      handleServiceWorkerMessage(event.data);
    });

    // log(`unregister result: `, await reg.unregister());
    // return;
  } else {
    log.error('window: service workers are not supported.');
    alert('Your browser does not support service workers. Please use another browser.');
    return;
  }

  // Initialize app store.
  await actions.initAppStore();
  await actions.makeSureConsistentUserAndCookie();

  // Request sync status from service worker.
  await postToServiceWorker({ command: 'sendSyncStatus' });

  // Sync online status.
  function onlineChanged() {
    appStore.update(app => {
      app.online = navigator.onLine;
    });
  }
  window.addEventListener('online', onlineChanged);
  window.addEventListener('offline', onlineChanged);

  // Sync online status periodically.
  setInterval(onlineChanged, 5000);

  // Sync when online.
  window.addEventListener('online', () => {
    postToServiceWorker({ command: 'sync' });
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

async function handleServiceWorkerMessage(message: t.ServiceWorkerToClientMessage) {
  switch (message.command) {
    case 'serviceWorkerActivated': {
      if (message.cacheVersion > CACHE_VERSION) {
        log(`window: require a page refresh to upgrade from ${CACHE_VERSION} to ${message.cacheVersion}`);
        actions.requireAppUpdate();
      }

      break;
    }
    case 'syncStatus': {
      appStore.update(app => {
        app.syncing = message.syncing;
      });

      break;
    }
    case 'refreshPage': {
      window.location.reload();
      break;
    }

    case 'notesInStorageChangedExternally': {
      window.dispatchEvent(new CustomEvent('notesInStorageChangedExternally'));
      actions.updateNotes();
      break;
    }

    case 'error': {
      actions.showMessage(message.error, { type: 'error' });
      break;
    }

    default:
      console.log('Unknown message', message);
  }
}

window.onload = setup;
