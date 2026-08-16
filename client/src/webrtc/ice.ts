const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export type IceConfig = {
  turnUrls?: string;
  turnUsername?: string;
  turnCredential?: string;
};

const envConfig: IceConfig = {
  turnUrls: import.meta.env.VITE_TURN_URL,
  turnUsername: import.meta.env.VITE_TURN_USERNAME,
  turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
};

function urlList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

function turnServer(config: IceConfig): RTCIceServer | null {
  const urls = urlList(config.turnUrls);
  const username = config.turnUsername ?? '';
  const credential = config.turnCredential ?? '';

  if (urls.length === 0 || username === '' || credential === '') return null;
  return { urls, username, credential };
}

export function iceServers(config: IceConfig = envConfig): RTCIceServer[] {
  const turn = turnServer(config);
  return turn === null ? [{ urls: STUN_URLS }] : [{ urls: STUN_URLS }, turn];
}

export function hasTurn(config: IceConfig = envConfig): boolean {
  return turnServer(config) !== null;
}
