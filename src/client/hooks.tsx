import { useRouter, storeScrollY } from './router.jsx';
import React, { useCallback, useState, useEffect, useLayoutEffect } from 'react';
import _ from 'lodash';

export function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const interval = setInterval(cb, ms);
    return () => clearInterval(interval);
  }, []);
}

export function useCallbackCancelEvent(cb: () => any, deps: React.DependencyList): (e?: React.UIEvent) => void {
  return useCallback((e?: React.UIEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    cb();
  }, deps);
}

// export function useLocation(): Location {
//   return useSyncExternalStore(subscribeToPopstate, () => window.location);
// }

// function subscribeToPopstate(cb: () => void): () => void {
//   window.addEventListener('popstate', cb);
//   return () => window.removeEventListener('popstate', cb);
// }

// export function useScrollToTop() {
//   useLayoutEffect(() => {
//     document.documentElement.scrollTo({
//       top: 0,
//       left: 0,
//       behavior: 'instant',
//     });
//   }, []);
// }

export function useClickWithoutDrag(cb: React.MouseEventHandler): {
  onClick: React.MouseEventHandler;
  onMouseDown: React.MouseEventHandler;
} {
  const [mouseDownPos, setMouseDownPos] = useState<[number, number] | undefined>();
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setMouseDownPos([e.clientX, e.clientY]);
  }, []);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (mouseDownPos) {
        const diff = [Math.abs(e.clientX - mouseDownPos[0]), Math.abs(e.clientY - mouseDownPos[1])];
        const dist = Math.sqrt(diff[0] ** 2 + diff[1] ** 2);
        if (dist < 5) return cb(e);
      }
    },
    [cb, mouseDownPos],
  );

  return { onClick, onMouseDown };
}

export function useStoreAndRestoreScrollY() {
  const { state } = useRouter();
  useLayoutEffect(() => {
    window.scrollTo(0, state?.scrollY ?? 0);

    const storeScrollYRateLimited = _.debounce(storeScrollY, 100, { leading: false, trailing: true });
    window.addEventListener('scroll', storeScrollYRateLimited);
    return () => window.removeEventListener('scroll', storeScrollYRateLimited);
  }, [state?.index]);
}
