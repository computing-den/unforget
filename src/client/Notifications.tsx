import * as actions from './appStoreActions.jsx';
import * as appStore from './appStore.js';
import React from 'react';

export default function Notifications() {
  const app = appStore.use();

  return (
    <>
      {app.message && (
        <div className={`msg-bar ${app.message.type} `}>
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
    </>
  );
}
