import { useRouter } from './router.jsx';
// import { Navigate, useLocation } from 'react-router-dom';
import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
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

  const app = appStore.use();
  const search = useRouter().search;

  if (app.user) {
    const from = new URLSearchParams(search).get('from');
    history.replaceState(null, '', from || '/');
    return null;
  }

  return (
    <PageLayout>
      <PageHeader />
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
            />
          </div>
          <div className="buttons">
            <button className="login" onClick={loginCb}>
              Log in
            </button>
            <button className="signup" onClick={signupCb}>
              Sign up
            </button>
          </div>
          {app.notes.length > 0 && (
            <div className="storage-message">
              <p>
                There are notes in storage.
                <br />
                They will be synced after you log in or sign up.
              </p>
              <button className="button-row" onClick={actions.clearStorage}>
                Clear local storage
              </button>
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export default LoginPage;
