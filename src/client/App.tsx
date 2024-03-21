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
  useSyncStorageWhenOnline();
  useSyncStorageOnMountAndPeriodically();

  useCheckAppUpdateOnVisibilityChange();
  useCheckAppUpdateWhenOnline();
  useCheckAppUpdatePeriodically();
  useCheckAppUpdateOnMount();

  useUpdateQueueCountPeriodically();

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
    }
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);
}

function useSyncStorageWhenOnline() {
  useEffect(() => {
    function callback() {
      storage.sync();
    }
    window.addEventListener('online', callback);
    return () => {
      window.removeEventListener('online', callback);
    };
  }, []);
}

function useSyncStorageOnMountAndPeriodically() {
  useEffect(() => {
    storage.sync();
  }, []);
  if (process.env.NODE_ENV !== 'development') {
    util.useInterval(() => storage.sync(), 5000);
  }
}

function useListenToStorageSync() {
  // Listen to storage's sync events and update notes.
  useEffect(() => {
    function syncListener(args: storage.SyncListenerArgs) {
      appStore.update(app => {
        app.syncing = !args.done;
      });
      // TypeError is thrown when device is offline or server is down or there's a Cors problem etc.
      // Should be ignored.
      if (args.done && args.error && !(args.error instanceof TypeError)) {
        actions.showMessage(`Sync failed: ${args.error.message}`, { type: 'error', hideAfterTimeout: true });
      }

      if (args.done && args.mergeCount > 0) actions.updateNotes();
    }
    storage.addSyncListener(syncListener);
    return () => storage.removeSyncListener(syncListener);
  }, []);
}

function useCheckAppUpdateOnVisibilityChange() {
  useEffect(() => {
    function callback() {
      console.log('visibility: ', document.visibilityState);
      if (document.visibilityState === 'visible') {
        actions.checkAppUpdate();
      }
    }
    window.addEventListener('visibilitychange', callback);

    return () => {
      window.removeEventListener('visibilitychange', callback);
    };
  }, []);
}

function useCheckAppUpdateWhenOnline() {
  useEffect(() => {
    function callback() {
      actions.checkAppUpdate();
    }
    window.addEventListener('online', callback);
    return () => {
      window.removeEventListener('online', callback);
    };
  }, []);
}

function useCheckAppUpdatePeriodically() {
  util.useInterval(() => actions.checkAppUpdate(), 10 * 1000);
}

function useCheckAppUpdateOnMount() {
  useEffect(() => {
    actions.checkAppUpdate();
  }, []);
}

function useUpdateQueueCountPeriodically() {
  util.useInterval(() => actions.updateQueueCount(), 3000);
}
