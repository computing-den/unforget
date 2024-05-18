import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import _ from 'lodash';

function DemoPage() {
  const app = appStore.use();

  if (app.user) {
    history.replaceState(null, '', '/');
  } else {
    actions.setUpDemo().then(() => history.replaceState(null, '', '/'));
  }
  return null;
}

export default DemoPage;
