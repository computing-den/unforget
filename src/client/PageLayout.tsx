import { useRouter } from './router.jsx';
import React, { useCallback, useState } from 'react';
import { useCallbackCancelEvent } from './hooks.js';
import * as actions from './appStoreActions.jsx';
import { Menu, MenuItem } from './Menu.jsx';
import { postToServiceWorker } from './clientToServiceWorkerApi.js';
import * as appStore from './appStore.js';
import _ from 'lodash';
import * as icons from './icons.js';
import { sync, requireQueueSync } from './sync.js';
// import log from './logger.js';

export function PageLayout(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

export type PageHeaderSecondRowProps = {
  title: string;
  actions: React.ReactNode;
};

type PageHeaderProps = {
  menu?: MenuItem[];
  actions?: React.ReactNode;
  title?: string;
  hasSticky?: boolean;
  hasSearch?: boolean;
  compact?: boolean;
  secondRow?: PageHeaderSecondRowProps;
};

export function PageHeader(props: PageHeaderProps) {
  const app = appStore.use();

  return (
    <div id="page-header" className={`${props.hasSearch ? 'has-search' : ''} ${props.compact ? 'compact' : ''}`}>
      <div id="page-header-inner-wrapper">
        {props.compact ? <PageHeaderContentCompact /> : <PageHeaderFirstRowContent {...props} />}
        {props.secondRow && <PageHeaderSecondRowContent {...props.secondRow} />}
        {app.message && (
          <div className={`msg-bar ${app.message.type} ${props.hasSticky ? 'has-sticky' : ''}`}>
            <div className="msg-bar-inner-container">
              <p>{app.message.text.substring(0, 100)}</p>
            </div>
          </div>
        )}
        {app.requirePageRefresh && (
          <div className="update-app-container">
            <button className="primary" onClick={actions.updateApp}>
              Click to update app
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PageHeaderContentCompact() {
  return <h1 className="heading">Unforget</h1>;
}

function PageHeaderFirstRowContent(props: PageHeaderProps) {
  const app = appStore.use();
  if (!app.user) throw new Error('PageHeaderFirstRowContent requires user');
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = useCallbackCancelEvent(() => setMenuOpen(x => !x), []);

  const fullSync = useCallback(() => {
    requireQueueSync();
    sync();
    actions.showMessage('Syncing ...');
  }, []);

  const forceCheckAppUpdate = useCallback(() => {
    actions.forceCheckAppUpdate();
    actions.showMessage('Checking for updates ...');
  }, []);

  const router = useRouter();

  function goToNotes(e?: React.UIEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setMenuOpen(false);
    if (router.pathname === '/') {
      window.scrollTo(0, 0);
    } else {
      history.pushState(null, '', '/');
    }
  }

  let menu: MenuItem[] | undefined;
  menu = _.compact([
    { label: _.upperFirst(app.user.username), icon: icons.user, isHeader: true },
    app.user.username === 'demo' && { label: 'Log in / Sign up', icon: icons.logIn, to: '/login' },
    ...(props.menu || []),
    { label: 'Notes', icon: icons.notes, onClick: goToNotes, to: '/' },
    { label: 'Archive', icon: icons.archiveEmpty, to: '/archive' },
    { label: 'Import', icon: icons.import, to: '/import' },
    { label: 'Export', icon: icons.export, to: '/export' },
    { label: 'About', icon: icons.info, to: '/about' },
    { label: 'Full sync', icon: icons.refreshCcw, onClick: fullSync, hasTopSeparator: true },
    { label: 'Check app updates', icon: icons.upgrade, onClick: forceCheckAppUpdate },
    { label: 'Log out', icon: icons.logOut, onClick: actions.logout, hasTopSeparator: true },
  ]);

  return (
    <div className="first-row-content">
      {!_.isEmpty(menu) && (
        <div className="menu-button-container">
          <div className="menu-button">
            <a href="#" onClick={toggleMenu} className="reset" id="page-header-menu-trigger">
              <img src={icons.menuWhite} />
            </a>
            {menuOpen && <Menu menu={menu!} side="left" onClose={toggleMenu} trigger="#page-header-menu-trigger" />}
          </div>
        </div>
      )}
      <div className="title">
        {/*
          <div className="logo">
            <Link to="/">
              <img src="/barefront.svg" />
            </Link>
            </div>
            */}
        <h1 className="heading">
          <a href="/" className="reset" onClick={goToNotes}>
            Unforget
          </a>
        </h1>
        {props.title && <h2>{props.title}</h2>}
        {app.user?.username !== 'demo' && app.queueCount > 0 && <div className="queue-count">({app.queueCount})</div>}
        {/*app.online && <div className="online-indicator" />*/}
      </div>
      <div className="actions">{props.actions}</div>
    </div>
  );
}

function PageHeaderSecondRowContent(props: PageHeaderSecondRowProps) {
  return (
    <div className="second-row-content">
      <h1 className="heading">{props.title}</h1>
      <div className="actions">{props.actions}</div>
    </div>
  );
}

export function PageBody(props: { children: React.ReactNode }) {
  return props.children;
}

export function PageAction(props: {
  className?: string;
  label?: string;
  icon?: string;
  onClick?: () => any;
  bold?: boolean;
  menu?: MenuItem[];
  title: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallbackCancelEvent(() => setMenuOpen(x => !x), []);
  const clicked = useCallbackCancelEvent(() => {
    if (props.menu) toggleMenu();
    props.onClick?.();
  }, [props.menu, props.onClick]);

  // We need action-container because <a> cannot be nested inside another <a> which we need for the menu.
  return (
    <div
      className={`action ${props.className || ''}`}
      key={`${props.label || '_'} ${props.icon || '_'}`}
      title={props.title}
    >
      <a href="#" onClick={clicked} className={`page-action-menu-trigger reset ${props.bold ? 'bold' : ''}`}>
        {props.label}
        {props.icon && <img src={props.icon} />}
      </a>
      {props.menu && menuOpen && (
        <Menu menu={props.menu} side="center" onClose={toggleMenu} trigger=".page-action-menu-trigger" />
      )}
    </div>
  );
}
