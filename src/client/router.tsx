import React, {
  useMemo,
  useCallback,
  useContext,
  createContext,
  useDeferredValue,
  useSyncExternalStore,
  Suspense,
} from 'react';

export type Route = {
  path: string;
  element: React.ReactNode | ((params: Params) => React.ReactNode);
  loader?: (match: RouteMatch) => Promise<any>;
};

export type RouterCtxType = {
  route?: Route;
  params?: Record<string, string>;
  search?: string;
  pathname: string;
  loader?: WrappedPromise<any>;
};

export type RouterLoadingCtxType = {
  isLoading: boolean;
};

export type Params = Record<string, string>;
// export type FallbackArgs = {isLoading: boolean};

export type RouteMatch = { route: Route; params: Params };

type WrappedPromise<T> = { read: () => T; status: 'pending' | 'success' | 'error' };

const RouterCtx = createContext<RouterCtxType>({ pathname: '/' });
const RouterLoadingCtx = createContext<RouterLoadingCtxType>({ isLoading: false });
// const dataLoaderCache = new Map<string, WrappedPromise<any>>();

export function Router(props: { routes: Route[]; fallback: React.ReactNode }) {
  const pathname = useWindowLocationPathname();
  const search = useWindowLocationSearch();
  const match = useMemo(() => matchRoute(pathname, props.routes), [pathname, props.routes]);
  const routerCtxValue: RouterCtxType = useMemo(() => {
    console.log('Creating router context for ', pathname);
    return {
      route: match?.route,
      params: match?.params,
      pathname,
      search,
      loader: match?.route.loader && wrapPromise(match.route.loader(match)),
    };
  }, [match, pathname, search]);
  const deferredCtxValue = useDeferredValue(routerCtxValue);

  const routerLoadingCtx = {
    isLoading: deferredCtxValue !== routerCtxValue,
  };
  console.log('router: isLoading: ', routerLoadingCtx.isLoading);

  // NOTE It is important that Suspense is not above the Router, otherwise when an element suspends,
  // the useMemo's and useState's of the Router will be called more than once.
  return (
    <Suspense fallback={props.fallback}>
      <RouterCtx.Provider value={deferredCtxValue}>
        <RouterLoadingCtx.Provider value={routerLoadingCtx}>
          <Suspender>{deferredCtxValue.route!.element}</Suspender>
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

function Suspender(props: { children: React.ReactNode | ((params: Params) => React.ReactNode) }) {
  const { loader, params } = useContext(RouterCtx);
  loader?.read();
  if (typeof props.children === 'function') {
    return props.children(params!);
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
    if (params) return { route, params };
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

export const useWindowLocationPathname = () => useSyncExternalStore(subscribeToLocationUpdates, getLocationPathname);
function getLocationPathname(): string {
  return window.location.pathname;
}

export const useWindowLocationSearch = () => useSyncExternalStore(subscribeToLocationUpdates, getLocationSearch);
function getLocationSearch(): string {
  return window.location.search;
}

function subscribeToLocationUpdates(callback: () => void) {
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

// Monkey patch window.history.
(function monkeyPatchHistory() {
  const origPushState = window.history.pushState;
  const origReplaceState = window.history.replaceState;
  window.history.pushState = function pushState(data: any, unused: string, url?: string | URL | null | undefined) {
    const result = origPushState.call(this, data, unused, url);
    const event = new Event(eventPushState);
    window.dispatchEvent(event);
    return result;
  };
  window.history.replaceState = function replaceState(
    data: any,
    unused: string,
    url?: string | URL | null | undefined,
  ) {
    const result = origReplaceState.call(this, data, unused, url);
    const event = new Event(eventReplaceState);
    window.dispatchEvent(event);
    return result;
  };
})();
