import { describe, expect, it } from 'vitest';
import { iceServers } from './ice';

const complete = {
  turnUrls: 'turn:relay.example.com:80',
  turnUsername: 'user',
  turnCredential: 'secret',
};

function turnEntry(servers: RTCIceServer[]): RTCIceServer | undefined {
  return servers.find((server) => server.username !== undefined);
}

describe('iceServers', () => {
  it('returns STUN only when nothing is configured', () => {
    const servers = iceServers({});

    expect(servers).toHaveLength(1);
    expect(servers[0]?.urls).toEqual([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ]);
  });

  it('appends a TURN server when url, username and credential are all present', () => {
    const servers = iceServers(complete);

    expect(servers).toHaveLength(2);
    expect(turnEntry(servers)).toEqual({
      urls: ['turn:relay.example.com:80'],
      username: 'user',
      credential: 'secret',
    });
  });

  it('keeps STUN first so it is tried before the relay', () => {
    expect(iceServers(complete)[0]?.username).toBeUndefined();
  });

  it('splits comma-separated TURN urls and trims them', () => {
    const servers = iceServers({
      ...complete,
      turnUrls: ' turn:relay.example.com:80 , turns:relay.example.com:443?transport=tcp ',
    });

    expect(turnEntry(servers)?.urls).toEqual([
      'turn:relay.example.com:80',
      'turns:relay.example.com:443?transport=tcp',
    ]);
  });

  it('ignores a TURN triple missing the url', () => {
    expect(iceServers({ ...complete, turnUrls: '' })).toHaveLength(1);
  });

  it('ignores a TURN triple missing the username', () => {
    expect(iceServers({ ...complete, turnUsername: '' })).toHaveLength(1);
  });

  it('ignores a TURN triple missing the credential', () => {
    expect(iceServers({ ...complete, turnCredential: '' })).toHaveLength(1);
  });

  it('ignores urls that are only separators', () => {
    expect(iceServers({ ...complete, turnUrls: ' , ' })).toHaveLength(1);
  });
});
