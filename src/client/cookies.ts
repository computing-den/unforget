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
  document.cookie = `unforget_token=${token}; path=/`;
}
