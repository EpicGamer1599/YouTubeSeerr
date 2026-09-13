import { secret, settings, validServerUrl, jellyfinDeviceId } from './config.js';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function jellyfin(
  path: string,
  options: { url?: string; token?: string; method?: string; body?: unknown; raw?: boolean } = {},
) {
  const url = validServerUrl(options.url || settings().jellyfinUrl);
  let response: Response;
  try {
    response = await fetch(url + path, {
      method: options.method || 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'MediaBrowser Client="YouTubeSeerr", Device="Server", DeviceId="' +
          jellyfinDeviceId +
          '", Version="1.0.0beta"' +
          (options.token ? ', Token="' + options.token.replace(/["\\\r\n]/g, '') + '"' : ''),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new HttpError(
      502,
      'Cannot reach Jellyfin. Check the server address and network connection.',
    );
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 401 || response.status === 403 ? 401 : 502,
      response.status === 401 || response.status === 403
        ? 'Jellyfin rejected the credentials or session. Please sign in again.'
        : 'Jellyfin could not complete the operation (HTTP ' + response.status + ').',
    );
  if (options.raw) return response;
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
export async function authenticate(url: string, username: string, password: string) {
  const data = await jellyfin('/Users/AuthenticateByName', {
    url,
    method: 'POST',
    body: { Username: username, Pw: password },
  });
  if (!data?.User?.Id || !data?.AccessToken || data.User.Policy?.IsDisabled)
    throw new HttpError(401, 'Jellyfin did not return an active user.');
  return data;
}
export async function refreshLibrary() {
  const s = settings();
  const token = secret('jellyfinToken');
  if (!token)
    throw new HttpError(400, 'Add a Jellyfin API key in Settings to refresh the library.');
  await jellyfin(
    s.jellyfinLibraryId
      ? '/Items/' +
          s.jellyfinLibraryId +
          '/Refresh?Recursive=true&MetadataRefreshMode=Default&ImageRefreshMode=Default'
      : '/Library/Refresh',
    { token, method: 'POST' },
  );
}
