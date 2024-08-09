import { produce } from 'immer';
import { useSyncExternalStore } from 'react';
import type * as t from '../common/types.js';

let store: t.AppStore;
let listeners: t.AppStoreListener[] = [];

export function get(): t.AppStore {
  return store;
}

export function set(newStore: t.AppStore) {
  const oldStore = store;
  store = newStore;
  for (const listener of listeners) listener(store, oldStore);
}

export function update(recipe: t.AppStoreRecipe) {
  set(produce(store, recipe));
}

export function addListener(listener: t.AppStoreListener) {
  listeners.push(listener);
  return () => removeListener(listener);
}

export function removeListener(listener: t.AppStoreListener) {
  const index = listeners.indexOf(listener);
  if (index !== -1) listeners.splice(index, 1);
}

export function use(): t.AppStore {
  return useSyncExternalStore(addListener, get);
}

declare global {
  var dev: any;
}

globalThis.dev ??= {};
globalThis.dev.getStore = get;
