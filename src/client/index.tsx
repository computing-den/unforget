import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './app.jsx';

function setup() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('serviceWorker.js').then(
      registration => {
        console.log('Service worker registration successful:', registration);
      },
      error => {
        console.error(`Service worker registration failed: ${error}`);
      },
    );
  } else {
    console.error('Service workers are not supported.');
  }

  const root = createRoot(document.getElementById('app')!);
  root.render(<App />);
}

window.onload = setup;
