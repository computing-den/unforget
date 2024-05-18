import { Router, Route, useRouter } from './router.jsx';
import React from 'react';
import * as appStore from './appStore.js';
import LoginPage from './LoginPage.jsx';
import { NotesPage, notesPageLoader } from './NotesPage.jsx';
import { NotePage, notePageLoader } from './NotePage.jsx';
import { ImportPage } from './ImportPage.jsx';
import _ from 'lodash';

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
      element: ({ params }) => (
        <Auth>
          <NotePage key={params.noteId as string} />
        </Auth>
      ),
      loader: notePageLoader,
    },
    {
      path: '/import',
      element: (
        <Auth>
          <ImportPage key="/import" />
        </Auth>
      ),
    },
    {
      path: '/archive',
      element: (
        <Auth>
          <NotesPage key="/archive" />
        </Auth>
      ),
      loader: notesPageLoader,
    },
    {
      path: '/',
      element: (
        <Auth>
          <NotesPage key="/" />
        </Auth>
      ),
      loader: notesPageLoader,
    },
  ];

  return <Router routes={routes} fallback={<Fallback />} />;
}

function Fallback() {
  return null;
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
