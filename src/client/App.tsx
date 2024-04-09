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
      path: '/archive',
      element: (
        <Auth>
          <NotesPage />
        </Auth>
      ),
      loader: notesPageLoader,
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
