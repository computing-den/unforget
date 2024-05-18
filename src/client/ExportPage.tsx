import React, { useCallback, useState, useEffect, useRef } from 'react';
import type * as t from '../common/types.js';
import { createNewNote } from '../common/util.js';
import * as actions from './appStoreActions.jsx';
import * as storage from './storage.js';
import { PageLayout, PageHeader, PageBody, PageAction } from './PageLayout.jsx';
import { Notes, Note } from './Notes.jsx';
import _ from 'lodash';
import exportMd from './notes/export.md';

const exportNote = createNewNote(exportMd);

export function ExportPage() {
  async function hashLinkClicked(hash: string) {
    try {
      const notes = await storage.getAllNotes();
      offerDownload('notes.json', JSON.stringify(notes, null, 2));
    } catch (error) {
      actions.gotError(error as Error);
    }
  }

  return (
    <PageLayout>
      <PageHeader title="/ export" />
      <PageBody>
        <div className="page">
          <Notes notes={[exportNote]} readonly onHashLinkClick={hashLinkClicked} />
        </div>
      </PageBody>
    </PageLayout>
  );
}

function offerDownload(filename: string, text: string) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}
