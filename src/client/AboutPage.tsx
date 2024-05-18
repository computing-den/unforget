import React from 'react';
import { createNewNote } from '../common/util.js';
import { PageLayout, PageHeader, PageBody } from './PageLayout.jsx';
import { Notes } from './Notes.jsx';
import _ from 'lodash';
import aboutMd from './notes/about.md';

const aboutNote = createNewNote(aboutMd);

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
