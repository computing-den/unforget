import React, { useCallback, useState, useEffect } from 'react';
import type * as t from '../common/types.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as util from './util.jsx';
import * as actions from './appStoreActions.jsx';
import PageTemplate from './PageTemplate.jsx';
import _ from 'lodash';
import { v4 as uuid } from 'uuid';

type LoginPageProps = {};

function LoginPage(props: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const usernameChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value), []);
  const passwordChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value), []);

  const loginCb = useCallback(() => actions.login({ username, password }), [username, password]);
  const signupCb = useCallback(() => actions.signup({ username, password }), [username, password]);

  return (
    <PageTemplate className="login-page">
      <div className="form-element">
        <label htmlFor="username">Username</label>
        <input
          className="text-input"
          type="text"
          name="username"
          required
          minLength={4}
          maxLength={50}
          onChange={usernameChanged}
        />
      </div>
      <div className="form-element">
        <label htmlFor="password">Password</label>
        <input
          className="text-input"
          type="password"
          name="password"
          required
          minLength={8}
          maxLength={100}
          onChange={passwordChanged}
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
    </PageTemplate>
  );
}

export default LoginPage;
