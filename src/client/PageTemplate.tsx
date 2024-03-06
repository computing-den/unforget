import React, { useCallback, useState, useEffect } from 'react';
import * as actions from './appStoreActions.jsx';
import * as storage from './storage.js';
import * as util from './util.js';
import * as appStore from './appStore.js';
import _ from 'lodash';

type PageTemplateProps = {
  children: React.ReactNode;
  className?: string;
};

function PageTemplate(props: PageTemplateProps) {
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
    <div className={props.className}>
      <div className="header">
        <div className="content">
          <div className="title">
            <div className="logo">
              <img src="/barefront.svg" />
            </div>
            <h1 className="heading">Unforget</h1>
            <div className="status">
              {app.online ? 'online' : 'offline'}
              {/*props.syncing && ' syncing'*/}
              {app.queueCount > 0 && ` (${app.queueCount})`}
            </div>
          </div>
          <div className="menu-button-container">
            <div className="menu-button">
              <a href="#" onClick={openMenu}>
                <img src="/icons/menu.svg" />
              </a>
              {app.menuOpen && (
                <div className="menu">
                  <ul>
                    {app.user && <li className="username">{app.user.username}</li>}
                    {app.user && (
                      <li>
                        <a href="#" onClick={sync}>
                          Sync
                        </a>
                      </li>
                    )}
                    {app.user && (
                      <li>
                        <a href="#" onClick={logout}>
                          Log out
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        {app.errorMsg && (
          <div className="app-error">
            <p>Error: {app.errorMsg}</p>
          </div>
        )}
      </div>
      <div className="body">{props.children}</div>
    </div>
  );
}

export default PageTemplate;
