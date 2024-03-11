import { createBrowserRouter, RouterProvider, useRouteError, redirect, LoaderFunctionArgs } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import LoginPage from './LoginPage.jsx';
import { NotesPage, notesPageLoader } from './NotesPage.jsx';
import { NotePage, notePageLoader } from './NotePage.jsx';

import _ from 'lodash';
import { v4 as uuid } from 'uuid';

export default function App() {
  // const app = appStore.use();
  // const location = util.useLocation();
  // const url = new URL(location.href);

  useSyncOnlineStatus();
  useListenToStorageSync();

  // Sync storage on mount and periodically.
  useEffect(() => {
    storage.sync();
  }, []);
  util.useInterval(() => storage.sync(), 5000);

  // Update queue count periodically.
  util.useInterval(() => actions.updateQueueCount(), 3000);

  const router = createBrowserRouter([
    {
      path: '/',
      errorElement: <ErrorPage />,
      children: [
        {
          path: '',
          element: <NotesPage />,
          loader: notesPageLoaderWithAuth,
        },
        {
          path: 'login',
          element: <LoginPage />,
        },
        {
          path: 'n/:noteId',
          element: <NotePage />,
          loader: notePageLoaderWithAuth,
        },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
}

async function notePageLoaderWithAuth(args: LoaderFunctionArgs): Promise<any> {
  console.log('calling note page loader');
  await requireUser(args);
  return await notePageLoader(args);
}

async function notesPageLoaderWithAuth(args: LoaderFunctionArgs): Promise<any> {
  console.log('calling notes page loader');
  await requireUser(args);
  return await notesPageLoader();
}

const requireUser = async (args: LoaderFunctionArgs) => {
  console.log('requireUser');
  const { user } = appStore.get();
  if (!user) {
    const from = new URL(args.request.url);
    const params = from.pathname === '/' ? '' : `?from=${from.pathname}`;
    throw redirect(`/login${params}`);
  }
  return null;
};

function ErrorPage() {
  const error = useRouteError() as Error;
  console.error(error);

  return (
    <div id="error-page">
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <p>
        <i>{error.message}</i>
      </p>
    </div>
  );
}

// function matchNotePage(pathname: string): { noteId: string } | undefined {
//   const match = pathname.match(/^\/n\/([^\/]*)$/);
//   if (match) return { noteId: match[1] };
// }

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

function useListenToStorageSync() {
  // Listen to storage's sync events and update notes.
  useEffect(() => {
    function syncListener(args: storage.SyncListenerArgs) {
      appStore.update(app => {
        app.syncing = !args.done;
        if (args.done && args.error) {
          app.message = { text: 'Sync failed: ' + args.error.message, type: 'error', timestamp: Date.now() };
        }
      });
      if (args.done && args.mergeCount > 0) actions.updateNotes();
    }
    storage.addSyncListener(syncListener);
    return () => storage.removeSyncListener(syncListener);
  }, []);
}
