import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import _ from 'lodash';

function DemoPage() {
  const user = appStore.get().user;
  if (!user || user.username === 'demo') {
    actions.setUpDemo().then(() => history.replaceState(null, '', '/'));
  } else {
    history.replaceState(null, '', '/');
  }

  return null;
}

export default DemoPage;
