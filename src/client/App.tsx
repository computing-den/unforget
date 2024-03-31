// import {
//   createBrowserRouter,
//   RouterProvider,
//   useRouteError,
//   Navigate,
//   useLocation,
//   Outlet,
//   LoaderFunctionArgs,
//   redirect,
// } from 'react-router-dom';
// import { Router, Route, BaseLocationHook } from 'wouter';
import { Router, Route, Params, Loader, useRouter } from './router.jsx';
import React, { useCallback, useState, useEffect, memo } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import LoginPage from './LoginPage.jsx';
import { NotesPage, notesPageLoader } from './NotesPage.jsx';
import { NotePage, notePageLoader } from './NotePage.jsx';
import _ from 'lodash';
import { ServerError } from '../common/util.js';

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

  const routes: Route[] = [
    {
      path: '/login',
      element: <LoginPage />,
    },
    {
      path: '/n/:noteId',
      element: (params: Params) => (
        <Auth>
          <NotePage key={params.noteId as string} />
        </Auth>
      ),
      loader: notePageLoader,
    },
    {
      path: '/',
      element: (
        <Auth>
          <NotesPage />
        </Auth>
      ),
      loader: notesPageLoader,
    },
  ];

  return <Router routes={routes} fallback={<Fallback />} />;
}

function Fallback() {
  return 'loading';
}

// function loaderWithAuth(loader: Loader): Loader {
//   return async match => {
//     if (appStore.get().user) return loader(match);
//   };
// }

function Auth(props: { children: React.ReactNode }) {
  const router = useRouter();
  const app = appStore.use();

  if (!app.user) {
    let params = '';
    if (router.pathname !== '/') {
      params = new URLSearchParams({ from: router.pathname }).toString();
    }
    const pathname = '/login' + (params ? `?${params}` : '');
    history.replaceState(null, '', pathname);
    return null;
  }

  return props.children;
}

// const useLocationWithTransition: BaseLocationHook = () => {
//   const [location, setLocation] = useBrowserLocation();
//   const [_isPending, startTransition] = useTransition();

//   return [
//     location,
//     (to, replace = false) => {
//       startTransition(() => {
//         console.log('going to ', to, 'in transition');
//         setLocation(to, replace);
//       });
//     },
//   ];
// };

// function Auth() {
//   // return <Outlet />;
//   const { user } = appStore.use();
//   const location = useLocation();

//   if (user) return <Outlet />;

//   let params = '';
//   if (location.pathname !== '/') {
//     params = new URLSearchParams({ from: location.pathname }).toString();
//   }
//   return <Navigate to={'/login' + (params ? `?${params}` : '')} replace />;
// }

// async function authLoader({ request }: LoaderFunctionArgs): Promise<null> {
//   const { user } = appStore.get();
//   if (!user) {
//     const pathname = new URL(request.url).pathname;
//     let sparams = '';
//     if (pathname !== '/') {
//       sparams = new URLSearchParams({ from: pathname }).toString();
//     }

//     const to = '/login' + (sparams ? `?${sparams}` : '');
//     throw redirect(to);
//   }
//   return null;
// }

// function ErrorPage() {
//   const error = useRouteError() as Error;
//   console.error(error);

//   return (
//     <div id="error-page">
//       <h1>Oops!</h1>
//       <p>Sorry, an unexpected error has occurred.</p>
//       <p>
//         <i>{error.message}</i>
//       </p>
//     </div>
//   );
// }

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
  // if (process.env.NODE_ENV !== 'development') {
  util.useInterval(() => storage.sync(), 5000);
  // }
}

function useListenToStorageSync() {
  // Listen to storage's sync events and update notes.
  useEffect(() => {
    async function syncListener(args: storage.SyncListenerArgs) {
      appStore.update(app => {
        app.syncing = !args.done;
      });
      if (args.done && args.error) {
        if (args.error instanceof TypeError) {
          // TypeError is thrown when device is offline or server is down or there's a Cors problem etc.
          // Should be ignored.
        } else if (args.error instanceof ServerError && args.error.code === 403) {
          await actions.resetUser();
        } else {
          actions.showMessage(`Sync failed: ${args.error.message}`, { type: 'error', hideAfterTimeout: true });
        }
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
