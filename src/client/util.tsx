// import React, { useCallback, useState, useEffect } from 'react';

export async function createFetchResponseError(res: Response): Promise<Error> {
  if (getResponseContentType(res) === 'application/json') {
    return new Error((await res.json()).message);
  } else {
    return new Error(await res.text());
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
