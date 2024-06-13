import React from 'react';
import * as appStore from './appStore.jsx';
import { createNewNote, CACHE_VERSION } from '../common/util.js';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
import { Notes } from './Notes.jsx';
import _ from 'lodash';
import aboutMd from './notes/about.md';

const technicalDetails = `\n\n# Technical details\n\nCache version: ${CACHE_VERSION}`;
const aboutNote = createNewNote(aboutMd + technicalDetails);

function AboutPage() {
  const app = appStore.use();

  return (
    <PageLayout>
      <PageHeader title="/ about" compact={!app.user} />
      <PageBody>
        <div className="page">
          <Notes notes={[aboutNote]} readonly />
        </div>
      </PageBody>
    </PageLayout>
  );
}

export default AboutPage;
