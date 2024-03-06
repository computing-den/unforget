// import React, { useCallback, useState, useEffect } from 'react';

export async function createFetchResponseError(res: Response): Promise<Error> {
  const contentType = getResponseContentType(res);
  if (contentType === 'application/json') {
    return new Error((await res.json()).message || 'unknown');
  } else {
    console.error(await res.text());
    return new Error(`unknown response of type ${contentType}`);
  }
}

function getResponseContentType(res: Response): string | undefined {
  return res.headers.get('Content-Type')?.split(/\s*;\s*/g)[0];
}

export async function postApi<T>(pathname: string, json?: any): Promise<T> {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json && JSON.stringify(json),
  });
  if (!res.ok) throw await createFetchResponseError(res);
  return await res.json();
}
