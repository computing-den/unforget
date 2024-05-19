import React from 'react';
import { createNewNote, CACHE_VERSION } from '../common/util.js';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
import { Notes } from './Notes.jsx';
import _ from 'lodash';
import aboutMd from './notes/about.md';

const technicalDetails = `\n\n### Techinal details\n\nCache version: ${CACHE_VERSION}`;
const aboutNote = createNewNote(aboutMd + technicalDetails);

function AboutPage() {
  return (
    <PageLayout>
      <PageHeader compact />
      <PageBody>
        <div className="page">
          <Notes notes={[aboutNote]} readonly />
        </div>
      </PageBody>
    </PageLayout>
  );
}

export default AboutPage;
