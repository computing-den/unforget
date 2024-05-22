import { ServerError, CACHE_VERSION } from '../common/util.js';

export async function post<T>(pathname: string, json?: any, params?: Record<string, string>): Promise<T> {
  const paramsStr = new URLSearchParams(params).toString();
  const res = await fetch(`${pathname}?${paramsStr}`, {
    // const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Cache-Version': String(CACHE_VERSION) },
    body: json && JSON.stringify(json),
  });
  if (!res.ok) {
    const error = await createServerError(res);
    // if (error.type === 'app_requires_update') {
    //   postMessageToServiceWorker({ command: 'update' });
    // }
    throw error;
  }
  return await res.json();
}

export async function createServerError(res: Response): Promise<ServerError> {
  const contentType = getResponseContentType(res);
  if (contentType === 'application/json') {
    return ServerError.fromJSON(await res.json());
  } else {
    console.error(await res.text());
    return new ServerError(`unknown response of type ${contentType}`, res.status);
  }
}

function getResponseContentType(res: Response): string | undefined {
  return res.headers.get('Content-Type')?.split(/\s*;\s*/g)[0];
}
