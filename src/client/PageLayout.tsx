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

  const openMenu = util.useCallbackCancelEvent(
    () =>
      appStore.update(app => {
        app.menuOpen = !app.menuOpen;
      }),
    [],
  );
  const logout = util.useCallbackCancelEvent(() => actions.logout(), []);
  const sync = util.useCallbackCancelEvent(() => storage.sync(), []);

  return (
    <div className="page-header">
      <div className="content">
        <div className="menu-button-container">
          <div className="menu-button">
            <a href="#" onClick={openMenu} className="reset">
              <img src="/icons/menu.svg" />
            </a>
            {app.menuOpen && (
              <div className="menu">
                <ul>
                  {app.user && <li className="username">{app.user.username}</li>}
                  {app.user && (
                    <li>
                      <a href="#" onClick={sync} className="reset">
                        Sync
                      </a>
                    </li>
                  )}
                  {app.user && (
                    <li>
                      <a href="#" onClick={logout} className="reset">
                        Log out
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="title">
          <div className="logo">
            <Link to="/">
              <img src="/barefront.svg" />
            </Link>
          </div>
          <h1 className="heading">
            <Link to="/" className="reset">
              Unforget
            </Link>
          </h1>
          <div className="status">
            {app.online ? 'online' : 'offline'}
            {/*props.syncing && ' syncing'*/}
            {app.queueCount > 0 && ` (${app.queueCount})`}
          </div>
        </div>
        <div className="actions">{props.actions}</div>
      </div>
      {app.errorMsg && (
        <div className="msg-bar">
          <p className="error">Error: {app.errorMsg}</p>
        </div>
      )}
      {app.infoMsg && (
        <div className="msg-bar">
          <p className="info">{app.infoMsg}</p>
        </div>
      )}
    </div>
  );
}

export function PageBody(props: { children: React.ReactNode }) {
  return props.children;
}

export function PageAction(props: { label: string; onClick: () => any }) {
  const clicked = util.useCallbackCancelEvent(props.onClick, [props.onClick]);
  return (
    <a href="#" onClick={clicked} className="reset">
      <b>{props.label}</b>
    </a>
  );
}
