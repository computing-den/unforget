import { Outlet, Link } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import * as actions from './appStoreActions.jsx';
import * as storage from './storage.js';
import * as util from './util.js';
import * as cutil from '../common/util.js';
import * as appStore from './appStore.js';
import _ from 'lodash';

export type MenuItem = {
  label: string;
  icon: string;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => any;
};

export function PageLayout(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

export function PageHeader(props: { menu?: MenuItem[]; actions?: React.ReactNode; title?: string }) {
  const app = appStore.use();

  useEffect(() => {
    function callback(e: MouseEvent) {
      const target = e.target as HTMLElement | undefined;
      if (appStore.get().menuOpen && !target?.closest('.menu-button')) {
        appStore.update(app => {
          app.menuOpen = false;
        });
      }
    }
    window.addEventListener('mousedown', callback);
    return () => window.removeEventListener('mousedown', callback);
  }, []);

  const toggleMenu = util.useCallbackCancelEvent(
    () =>
      appStore.update(app => {
        app.menuOpen = !app.menuOpen;
      }),
    [],
  );
  const logout = util.useCallbackCancelEvent(() => {
    toggleMenu();
    actions.logout();
  }, []);

  const fullSync = util.useCallbackCancelEvent(() => {
    toggleMenu();
    storage.fullSync();
    actions.showMessage('syncing ...', { hideAfterTimeout: true });
  }, []);

  const about = util.useCallbackCancelEvent(() => {
    alert(`Unforget: made by Computing Den.\n\n<cache version ${cutil.CACHE_VERSION}>`);
    toggleMenu();
  }, []);

  const menu: MenuItem[] = _.compact([
    ...(props.menu || []),
    app.user && { label: 'Full sync', icon: '/icons/refresh-ccw.svg', onClick: fullSync },
    app.user && { label: 'Log out', icon: '/icons/log-out.svg', onClick: logout },
    app.user && { label: 'About', icon: '/icons/info.svg', onClick: about },
  ]);

  return (
    <div className="page-header">
      <div className="content">
        <div className="menu-button-container">
          <div className="menu-button">
            <a href="#" onClick={toggleMenu} className="reset">
              <img src="/icons/menu-white.svg" />
            </a>
            {app.menuOpen && (
              <div className="menu">
                <ul>
                  {app.user && (
                    <li className="user">
                      {app.user.username}
                      <img src="/icons/user.svg" />
                    </li>
                  )}
                  {menu.map(item => (
                    <li>
                      <a href="#" onClick={item.onClick} className="reset">
                        {item.label}
                        <img src={item.icon} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
        <div className="msg-bar">
          <p className={app.message.type}>{app.message.text}</p>
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
  onClick: () => any;
  bold?: boolean;
}) {
  const clicked = util.useCallbackCancelEvent(props.onClick, [props.onClick]);
  return (
    <a href="#" onClick={clicked} className={`action reset ${props.bold ? 'bold' : ''} ${props.className || ''}`}>
      {props.label}
      {props.icon && <img src={props.icon} />}
    </a>
  );
}
