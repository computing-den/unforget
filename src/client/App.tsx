import { createBrowserRouter, RouterProvider, useRouteError, redirect, LoaderFunctionArgs } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import LoginPage from './LoginPage.jsx';
import NotesPage from './NotesPage.jsx';
import { NotePage, notePageLoader } from './NotePage.jsx';

import _ from 'lodash';
import { v4 as uuid } from 'uuid';

export default function App() {
  const app = appStore.use();
  // const location = util.useLocation();
  // const url = new URL(location.href);

  useSyncOnlineStatus();
  useUpdateNotesAfterStorageSync();

  // Sync storage on mount and periodically.
  useEffect(() => {
    storage.sync();
  }, []);
  util.useInterval(() => storage.sync(), 5000);

  // Update queue count periodically.
  util.useInterval(() => actions.updateQueueCount(), 3000);

  // Update notes on mount.
  useEffect(() => {
    actions.updateNotes();
  }, []);

  const router = createBrowserRouter([
    {
      path: '/',
      errorElement: <ErrorPage />,
      children: [
        {
          path: '',
          element: <NotesPage />,
          loader: requireUser,
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

const requireUser = async (args: LoaderFunctionArgs) => {
  console.log('requireUser');
  const { user } = appStore.get();
  if (!user) {
    const url = new URL(args.request.url);
    throw redirect(`/login?from=${url.pathname}`);
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

function useUpdateNotesAfterStorageSync() {
  // Listen to storage's sync events and update notes.
  useEffect(() => {
    function syncListener(args: storage.SyncListenerArgs) {
      console.log('syncListener: ', args);

      if (args.done) actions.updateNotes();

      appStore.update(app => {
        app.syncing = !args.done;
        // Only update error message if syncing has ended because listener is also called when a new sync starts.
        if (args.done) app.errorMsg = args.error?.message;
      });
    }
    storage.addSyncListener(syncListener);
    return () => storage.removeSyncListener(syncListener);
  }, []);
}
