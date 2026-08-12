const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export function iceServers(): RTCIceServer[] {
  return [{ urls: STUN_URLS }];
}
