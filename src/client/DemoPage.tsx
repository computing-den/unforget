import * as actions from './appStoreActions.jsx';
import _ from 'lodash';

function DemoPage() {
  actions.setUpDemo().then(() => history.replaceState(null, '', '/'));

  return null;
}

export default DemoPage;
