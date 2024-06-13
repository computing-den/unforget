import { useRouter } from './router.jsx';
import React, { useEffect, useState } from 'react';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
import _ from 'lodash';

type LoginPageProps = {};

function LoginPage(props: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const valid = Boolean(username && password);
  let passwordStrength = 0;

  if (password) {
    if (password.length >= 10) passwordStrength++;
    if (/[a-z]/.test(password)) passwordStrength++;
    if (/[A-Z]/.test(password)) passwordStrength++;
    if (/[0-9]/.test(password)) passwordStrength++;
    if (/[^a-zA-Z0-9]/.test(password)) passwordStrength++;
    if (/[^0-9]/.test(password) && password.length >= 16) passwordStrength = 5;
  }

  async function loginCb() {
    if (valid) {
      await actions.login({ username, password }, { importDemoNotes: false });
    } else {
      actions.showMessage('Please enter username and password');
    }
  }
  async function signupCb() {
    if (valid) {
      if (passwordStrength < 5) {
        const answer = window.confirm(
          'A weak password enables a hacker to break the encryption of your data. Are you sure you want to continue?',
        );
        if (!answer) return;
      }
      await actions.signup({ username, password }, { importDemoNotes: true });
    } else {
      actions.showMessage('Please enter username and password');
    }
  }

  function keyDownCb(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && valid) loginCb();
  }

  const app = appStore.use();
  const search = useRouter().search;

  useEffect(() => {
    if (app.user && app.user?.username !== 'demo') {
      const from = new URLSearchParams(search).get('from');
      history.replaceState(null, '', from || '/');
    }
  }, [app.user]);

  return (
    <PageLayout>
      <PageHeader compact />
      <PageBody>
        <div className="page login-page">
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
            <label htmlFor="password">
              Password
              {password && (
                <span className={`strength strength-${passwordStrength}`}> strength: {passwordStrength} / 5</span>
              )}
            </label>
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
          {/*app.user?.username === 'demo' && app.notes.length > 0 && (
            <div className="form-element">
              <label>
                <input type="checkbox" onChange={e => setImportDemoNotes(e.target.checked)} checked={importDemoNotes} />{' '}
                Import {app.notes.length} {app.notes.length === 1 ? 'note' : 'notes'} from demo user (
                <Link to="/">see notes</Link>)
              </label>
            </div>
          )*/}
          <div className="buttons">
            <button className="login primary" onClick={loginCb}>
              Log in
            </button>
            <button className="signup" onClick={signupCb}>
              Sign up
            </button>
          </div>
          {/*<div className="section welcome">
            <p>Unforget is a note taking app.</p>
            <p>Notes will be encrypted on your device(s).</p>
            <p>Nobody can recover your notes if you lose your password.</p>
            </div>*/}
          {/*app.notes.length > 0 && (
            <div className="section storage-message">
              <p>
                There are existing notes on this device.
                <br />
                They'll be synced after you log in or sign up.
              </p>
              <button onClick={actions.clearStorage}>Clear local storage</button>
            </div>
            )*/}
        </div>
      </PageBody>
    </PageLayout>
  );
}

export default LoginPage;
