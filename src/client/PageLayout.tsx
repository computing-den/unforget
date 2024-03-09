import { Outlet, Link } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import * as actions from './appStoreActions.jsx';
import * as storage from './storage.js';
import * as util from './util.js';
import * as appStore from './appStore.js';
import _ from 'lodash';

export function PageLayout(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

export function PageHeader(props: { actions?: React.ReactNode }) {
  const app = appStore.use();

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
                  {app.user && (
                    <li>
                      <a href="#" onClick={fullSync} className="reset">
                        Full sync
                        <img src="/icons/refresh-ccw.svg" />
                      </a>
                    </li>
                  )}
                  {app.user && (
                    <li>
                      <a href="#" onClick={logout} className="reset">
                        Log out
                        <img src="/icons/log-out.svg" />
                      </a>
                    </li>
                  )}
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

export function PageAction(props: { label?: string; icon?: string; onClick: () => any; bold?: boolean }) {
  const clicked = util.useCallbackCancelEvent(props.onClick, [props.onClick]);
  return (
    <a href="#" onClick={clicked} className={`reset ${props.bold ? 'bold' : ''}`}>
      {props.label}
      {props.icon && <img src={props.icon} />}
    </a>
  );
}
