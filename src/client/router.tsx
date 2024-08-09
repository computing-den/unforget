import React, {
  useMemo,
  useCallback,
  useContext,
  createContext,
  useDeferredValue,
  useSyncExternalStore,
  Suspense,
} from 'react';
import log from './logger.js';

export type HistoryState = { index: number; scrollY?: number };

export type Route = {
  path: string;
  element: React.ReactNode | ((match: RouteMatch) => React.ReactNode);
  loader?: Loader;
};

export type Loader = (match: RouteMatch) => Promise<any>;

export type RouterCtxType = {
  match?: RouteMatch;
  search: string;
  pathname: string;
  state: HistoryState;
  loaderData?: WrappedPromise<any>;
};

export type RouterLoadingCtxType = {
  isLoading: boolean;
};

export type Params = Record<string, string>;
// export type FallbackArgs = {isLoading: boolean};

export type RouteMatch = { route: Route; params: Params; pathname: string };

type WrappedPromise<T> = { read: () => T; status: 'pending' | 'success' | 'error' };

const RouterCtx = createContext<RouterCtxType>({ pathname: '/', search: '', state: { index: 0 } });
const RouterLoadingCtx = createContext<RouterLoadingCtxType>({ isLoading: false });
// const dataLoaderCache = new Map<string, WrappedPromise<any>>();

export function Router(props: { routes: Route[]; fallback: React.ReactNode }) {
  const pathname = useWindowLocationPathname();
  const search = useWindowLocationSearch();
  const state = useWindowHistoryState();
  const match = useMemo(() => matchRoute(pathname, props.routes), [pathname, props.routes]);
  const routerCtxValue: RouterCtxType = useMemo(() => {
    log('Creating router context for ', pathname);
    return {
      match,
      pathname,
      search,
      state,
      loaderData: match?.route.loader && wrapPromise(match.route.loader(match)),
    };
  }, [match, pathname, search, state]);
  const deferredCtxValue = useDeferredValue(routerCtxValue);

  const routerLoadingCtx = {
    isLoading: deferredCtxValue !== routerCtxValue,
  };
  log('router: isLoading: ', routerLoadingCtx.isLoading);

  // NOTE It is important that Suspense is not above the Router, otherwise when an element suspends,
  // the useMemo's and useState's of the Router will be called more than once.
  return (
    <Suspense fallback={props.fallback}>
      <RouterCtx.Provider value={deferredCtxValue}>
        <RouterLoadingCtx.Provider value={routerLoadingCtx}>
          <Suspender>{deferredCtxValue.match?.route.element}</Suspender>
        </RouterLoadingCtx.Provider>
      </RouterCtx.Provider>
    </Suspense>
  );
}

export function Link(props: { to: string; className?: string; children: React.ReactNode }) {
  const clickCb = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      history.pushState(null, '', props.to);
    },
    [props.to],
  );
  return (
    <a href={props.to} onClick={clickCb} className={props.className}>
      {props.children}
    </a>
  );
}

function Suspender(props: { children: Route['element'] }) {
  const { loaderData, match } = useContext(RouterCtx);
  loaderData?.read(); // It'll throw a promise if not yet resolved.
  if (typeof props.children === 'function') {
    return props.children(match!);
  } else {
    return props.children;
  }
}

export function useRouterLoading(): RouterLoadingCtxType {
  return useContext(RouterLoadingCtx);
}

export function useRouter(): RouterCtxType {
  return useContext(RouterCtx);
}

function matchRoute(pathname: string, routes: Route[]): RouteMatch | undefined {
  const actualParts = pathname.split('/');
  for (const route of routes) {
    const expectedParts = route.path.split('/');
    const params = matchParts(actualParts, expectedParts);
    if (params) return { route, params, pathname };
  }
}

function matchParts(actualParts: string[], expectedParts: string[]): Params | undefined {
  if (actualParts.length !== expectedParts.length) return;

  const params: Params = {};
  for (let i = 0; i < actualParts.length; i++) {
    if (expectedParts[i].startsWith(':')) {
      params[expectedParts[i].substring(1)] = actualParts[i];
    } else if (actualParts[i] !== expectedParts[i]) {
      return;
    }
  }
  return params;
}

const eventPopstate = 'popstate';
const eventPushState = 'pushstate';
const eventReplaceState = 'replacestate';
const eventHashchange = 'hashchange';
const events = [eventPopstate, eventPushState, eventReplaceState, eventHashchange];

// export const navigate = (to: string, opts?: { replace?: boolean; state?: any }) =>
//   opts?.replace ? window.history.replaceState(opts?.state, '', to) : window.history.pushState(opts?.state, '', to);

export const useWindowLocationPathname = () => useSyncExternalStore(subscribeToHistoryUpdates, getLocationPathname);
function getLocationPathname(): string {
  return window.location.pathname;
}

export const useWindowLocationSearch = () => useSyncExternalStore(subscribeToHistoryUpdates, getLocationSearch);
function getLocationSearch(): string {
  return window.location.search;
}

export const useWindowHistoryState = () => useSyncExternalStore(subscribeToHistoryUpdates, getHistoryState);
function getHistoryState(): HistoryState {
  return window.history.state;
}

function subscribeToHistoryUpdates(callback: () => void) {
  for (const event of events) {
    window.addEventListener(event, callback);
  }
  return () => {
    for (const event of events) {
      window.removeEventListener(event, callback);
    }
  };
}

function wrapPromise<T>(promise: Promise<T>): WrappedPromise<T> {
  let status: 'pending' | 'success' | 'error' = 'pending';
  let error: Error | undefined;
  let value: T | undefined;

  promise
    .then(v => {
      status = 'success';
      value = v;
    })
    .catch(e => {
      status = 'error';
      error = e;
    });

  return {
    get status() {
      return status;
    },
    read() {
      if (status === 'pending') throw promise;
      if (status === 'error') throw error!;
      return value!;
    },
  };
}

function assertHistoryStateType(data: any) {
  if (data !== null && data !== undefined && typeof data !== 'object')
    throw new Error('Please provide an object as history state');
}

let origReplaceState: (data: any, unused: string, url?: string | URL | null) => void;
let origPushState: (data: any, unused: string, url?: string | URL | null) => void;

/**
 * For some reason the browser sometimes does it properly and sometimes not.
 * Probably due to the whole React suspense and the delay in page transition.
 * So, we do it manually.
 */
export function setUpManualScrollRestoration() {
  window.history.scrollRestoration = 'manual';
}

export function storeScrollY() {
  const state: HistoryState = { ...window.history.state, scrollY: window.scrollY };
  origReplaceState.call(window.history, state, ''); // Won't dispatch any events.
}

/**
 * Monkey patch window.history to dispatch 'pushstate' and 'replacestate' events.
 * Also keep extra data the history state:
 *   index: number so that for example we know if history.back() can be called.
 */
export function patchHistory() {
  origPushState = window.history.pushState;
  origReplaceState = window.history.replaceState;
  window.history.pushState = function pushState(data: any, unused: string, url?: string | URL | null) {
    try {
      log(`pushState (patched) ${url} started`);
      assertHistoryStateType(data);
      const state: HistoryState = { ...data, index: window.history.state.index + 1 };
      origPushState.call(this, state, unused, url);
      const event = new Event(eventPushState);
      window.dispatchEvent(event);
      log(`pushState (patched) ${url} done`);
    } catch (error) {
      log.error(error);
    }
  };
  window.history.replaceState = function replaceState(data: any, unused: string, url?: string | URL | null) {
    try {
      assertHistoryStateType(data);
      const state: HistoryState = { ...data, index: window.history.state.index };
      origReplaceState.call(this, state, unused, url);
      const event = new Event(eventReplaceState);
      window.dispatchEvent(event);
    } catch (error) {
      log.error(error);
    }
  };

  // Initialize history.state
  if (!Number.isFinite(window.history.state?.index)) {
    origReplaceState.call(window.history, { index: 0 }, '');
  }
}
