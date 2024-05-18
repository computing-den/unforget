import type * as t from '../common/types.js';
import { createRoot } from 'react-dom/client';
import * as storage from './storage.js';
import { setUpManualScrollRestoration, patchHistory } from './router.jsx';
import React from 'react';
import App from './App.jsx';
import * as appStore from './appStore.jsx';
import * as actions from './appStoreActions.jsx';
import { ServerError, CACHE_VERSION } from '../common/util.js';
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
      log(`window: received message from service worker`, event.data);
      handleServiceWorkerMessage(event.data);
    });
  } else {
    log.error('window: service workers are not supported.');
  }

  // Initialize app store.
  await actions.initAppStore();
  await actions.makeSureConsistentUserAndCookie();

  // // Set up a demo user.
  // if (!appStore.get().user) {
  //   await actions.setUpDemo();
  // }

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
    case 'synced': {
      if (message.error) actions.showMessage(message.error, { type: 'error' });

      appStore.update(app => {
        app.syncing = false;
      });

      break;
    }
    case 'syncing': {
      appStore.update(app => {
        app.syncing = true;
      });
      break;
    }
    case 'refreshPage': {
      window.location.reload();
      break;
    }

    case 'notesInStorageChangedExternally': {
      window.dispatchEvent(new CustomEvent('notesInStorageChangedExternally'));
      break;
    }

    default:
      console.log('Unknown message', message);
  }
}

window.onload = setup;
