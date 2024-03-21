import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App.jsx';
import * as appStore from './appStore.jsx';
import * as actions from './appStoreActions.jsx';

async function setup() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/serviceWorker.js').then(
      registration => {
        console.log('window: service worker registration successful:', registration);
      },
      error => {
        console.error(`window: service worker registration failed: ${error}`);
      },
    );

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.command === 'refreshPage') {
        console.log('window: received refreshPage from service worker client');
        // window.location.reload();
        appStore.update(app => {
          app.requirePageRefresh = true;
        });
      }
    });
  } else {
    console.error('window: service workers are not supported.');
  }

  await actions.initAppStore();

  const root = createRoot(document.getElementById('app')!);
  root.render(<App />);
}

window.onload = setup;
