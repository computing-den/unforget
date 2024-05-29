import log from './logger.js';

export function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')[1];
}

export function getUserTokenFromCookie(): string | undefined {
  return getCookie('unforget_token');
}

export function setUserCookies(token: string) {
  const maxAge = 10 * 365 * 24 * 3600; // 10 years in seconds
  document.cookie = `unforget_token=${token}; max-age=${maxAge}; path=/`;
}
