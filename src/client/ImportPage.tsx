import { useRouter, RouteMatch } from './router.jsx';
import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
// import { isNoteNewerThan } from '../common/util.js';
import * as storage from './storage.js';
import * as appStore from './appStore.js';
import * as actions from './appStoreActions.jsx';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import _ from 'lodash';
import * as icons from './icons.js';
import log from './logger.js';

export function ImportPage() {
  // const app = appStore.use();

  const [file, setFile] = useState<File>();

  function importCb() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input.click();
  }

  const pageActions: React.ReactNode[] = [
    // <PageAction icon={icons.bulletpointWhite} onClick={cycleListStyleCb} title="Cycle list style" />,
  ];

  return (
    <PageLayout>
      <PageHeader actions={pageActions} title="import" />
      <PageBody>
        <div className="import-page">
          <div className="page-content">
            <h1>Google Keep</h1>
            <p>
              Go to{' '}
              <a target="_blank" href="https://takeout.google.com/">
                Google Takeout
              </a>
              .
            </p>
            <p>Select only Keep's data for export.</p>
            <p>Export it as a zip file.</p>
            <p className="wait-for-download">It'll be ready for download in a few minutes.</p>
            <p className="on-device">Your data will stay on your device.</p>
            {/*
            <div>
              <label className="file">
                <input type="file" id="file" onChange={e => setFile(e.target.files?.[0])} />
                <span className="file-custom">
                  <span className="custom-label">
                    {_.truncate(file?.name, { length: 30 }) || 'Select zip file ...'}
                  </span>
                </span>
              </label>
              </div>
              */}

            <button className="import primary" onClick={importCb}>
              Import notes from zip file
            </button>
            <input type="file" name="file" accept="application/zip" onChange={e => setFile(e.target.files?.[0])} />

            {/*<div>{_.truncate(file?.name, { length: 30 }) || 'Select zip file ...'}</div>*/}
          </div>
        </div>
      </PageBody>
    </PageLayout>
  );
}
