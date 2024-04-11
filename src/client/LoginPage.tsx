import { useRouter } from './router.jsx';
import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeaderCompact, PageBody } from './PageLayout.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type LoginPageProps = {};

function LoginPage(props: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function loginCb() {
    await actions.login({ username, password });
  }
  async function signupCb() {
    await actions.signup({ username, password });
  }

  function keyDownCb(e: React.KeyboardEvent) {
    if (e.key === 'Enter') loginCb();
  }

  const app = appStore.use();
  const search = useRouter().search;

  if (app.user) {
    const from = new URLSearchParams(search).get('from');
    history.replaceState(null, '', from || '/');
    return null;
  }

  return (
    <PageLayout>
      <PageHeaderCompact />
      <PageBody>
        <div className="login-page">
          <div className="form-element">
            <label htmlFor="username">Username</label>
            <input
              className="text-input small"
              type="text"
              name="username"
              required
              minLength={4}
              maxLength={50}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={keyDownCb}
            />
          </div>
          <div className="form-element">
            <label htmlFor="password">Password</label>
            <input
              className="text-input small"
              type="password"
              name="password"
              required
              minLength={8}
              maxLength={100}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={keyDownCb}
            />
          </div>
          <div className="buttons">
            <button className="login primary" onClick={loginCb}>
              Log in
            </button>
            <button className="signup" onClick={signupCb}>
              Sign up
            </button>
          </div>
          <div className="section welcome">
            <p>Unforget is a note taking app.</p>
            <p>Notes will be encrypted on your device(s).</p>
            <p>Nobody can recover your notes if you lose your password.</p>
          </div>
          {app.notes.length > 0 && (
            <div className="section storage-message">
              <p>
                There are notes in storage.
                <br />
                They will be synced after you log in or sign up.
              </p>
              <button onClick={actions.clearStorage}>Clear local storage</button>
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export default LoginPage;
