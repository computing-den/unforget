import { Router, Route, useRouter } from './router.jsx';
import React, { useEffect } from 'react';
import * as appStore from './appStore.js';
import log from './logger.js';
import LoginPage from './LoginPage.jsx';
import AboutPage from './AboutPage.jsx';
import DemoPage from './DemoPage.jsx';
import { NotesPage, notesPageLoader } from './NotesPage.jsx';
import { NotePage, notePageLoader } from './NotePage.jsx';
import { ImportPage } from './ImportPage.jsx';
import { ExportPage } from './ExportPage.jsx';
import Notifications from './Notifications.jsx';
import _ from 'lodash';

export default function App() {
  const routes: Route[] = [
    {
      path: '/login',
      element: <LoginPage />,
    },
    {
      path: '/about',
      element: <AboutPage />,
    },
    {
      path: '/demo',
      element: <DemoPage />,
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
      path: '/export',
      element: (
        <Auth>
          <ExportPage key="/export" />
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

  return (
    <>
      <Router routes={routes} fallback={<Fallback />} />
      <Notifications />
    </>
  );
}

function Fallback() {
  return null;
}

function Auth(props: { children: React.ReactNode }) {
  const router = useRouter();
  const app = appStore.use();

  useEffect(() => {
    if (!app.user) {
      let params = '';
      if (router.pathname !== '/') {
        params = new URLSearchParams({ from: router.pathname }).toString();
      }
      const url = '/login' + (params ? `?${params}` : '');
      history.replaceState(null, '', url);
    }
  }, [app.user, router]);

  return app.user ? props.children : null;
}
