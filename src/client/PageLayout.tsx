import { Link, useRouter } from './router.jsx';
// import { Link } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import * as actions from './appStoreActions.jsx';
import { Menu, MenuItem } from './Menu.jsx';
import * as storage from './storage.js';
import * as util from './util.js';
import * as cutil from '../common/util.js';
import * as appStore from './appStore.js';
import _ from 'lodash';
import * as icons from './icons.js';

export function PageLayout(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

export function PageHeader(props: {
  menu?: MenuItem[];
  actions?: React.ReactNode;
  title?: string;
  hasSticky?: boolean;
}) {
  const app = appStore.use();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = util.useCallbackCancelEvent(() => setMenuOpen(x => !x), []);

  const fullSync = useCallback(() => {
    storage.fullSync();
    actions.showMessage('syncing ...', { hideAfterTimeout: true });
  }, []);

  const about = useCallback(() => {
    alert(`Unforget: made by Computing Den.\n\n<cache version ${cutil.CACHE_VERSION}>`);
  }, []);

  const refreshPage = useCallback(() => {
    window.location.reload();
  }, []);

  const router = useRouter();

  const goToNotes = useCallback(() => {
    if (router.pathname !== '/') {
      history.pushState(null, '', '/');
    }
  }, [router]);

  const goToArchive = useCallback(() => {
    if (router.pathname !== '/archive') {
      history.pushState(null, '', '/archive');
    }
  }, [router]);

  const menu: MenuItem[] = _.compact([
    app.user && { label: app.user.username, icon: icons.user, isHeader: true },
    ...(props.menu || []),
    { label: 'Notes', icon: icons.notes, onClick: goToNotes },
    { label: 'Archive', icon: icons.archiveEmpty, onClick: goToArchive },
    app.user && { label: 'Full sync', icon: icons.refreshCcw, onClick: fullSync },
    app.user && { label: 'Log out', icon: icons.logOut, onClick: actions.logout },
    { label: 'About', icon: icons.info, onClick: about },
  ]);

  // const { isLoading } = useRouterLoading();
  // console.log('PageLayout: isLoading: ', isLoading);

  return (
    <div id="page-header">
      <div className="content">
        <div className="menu-button-container">
          <div className="menu-button">
            <a href="#" onClick={toggleMenu} className="reset" id="page-header-menu-trigger">
              <img src={icons.menuWhite} />
            </a>
            {menuOpen && <Menu menu={menu} side="left" onClose={toggleMenu} trigger="#page-header-menu-trigger" />}
          </div>
        </div>
        <div className="title">
          {/*
          <div className="logo">
            <Link to="/">
              <img src="/barefront.svg" />
            </Link>
            </div>
            */}
          <h1 className="heading">
            <Link to="/" className="reset">
              Unforget
            </Link>
          </h1>
          {props.title && <h2 className="page-title">{props.title}</h2>}
          {app.queueCount > 0 && <div className="queue-count">({app.queueCount})</div>}
          {/*app.online && <div className="online-indicator" />*/}
        </div>
        <div className="actions">{props.actions}</div>
      </div>
      {app.message && (
        <div className={`msg-bar ${app.message.type} ${props.hasSticky ? 'has-sticky' : ''}`}>
          <div className="msg-bar-inner-container">
            <p>{app.message.text.substring(0, 100)}</p>
          </div>
        </div>
      )}
      {app.requirePageRefresh && (
        <div className="refresh-page-container">
          <button className="refresh-page" onClick={refreshPage}>
            Update app
          </button>
        </div>
      )}
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = util.useCallbackCancelEvent(() => setMenuOpen(x => !x), []);
  const clicked = util.useCallbackCancelEvent(() => {
    if (props.menu) toggleMenu();
    props.onClick?.();
  }, [props.menu, props.onClick]);

  // We need action-container because <a> cannot be nested inside another <a> which we need for the menu.
  return (
    <div className="action" key={`${props.label || '_'} ${props.icon || '_'}`}>
      <a
        href="#"
        onClick={clicked}
        className={`page-action-menu-trigger reset ${props.bold ? 'bold' : ''} ${props.className || ''}`}
      >
        {props.label}
        {props.icon && <img src={props.icon} />}
      </a>
      {props.menu && menuOpen && (
        <Menu menu={props.menu} side="center" onClose={toggleMenu} trigger=".page-action-menu-trigger" />
      )}
    </div>
  );
}
