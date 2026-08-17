import { describe, expect, it } from 'vitest';
import { buildLinks, LOCAL_ID } from './mesh-links';
import type { PeerParticipant, PeerStat } from '../types';

function peer(socketId: string, quality: PeerParticipant['quality'] = null): PeerParticipant {
  return {
    socketId,
    displayName: socketId,
    stream: null,
    connectionState: 'connected',
    quality,
    micOn: true,
    cameraOn: true,
    lost: false,
  };
}

const good = { rtt: 20, loss: 0.001, bitrate: 500_000, bucket: 'good' as const, relayed: false };

function stat(peerId: string, over: Partial<PeerStat> = {}): PeerStat {
  return { peerId, bucket: 'good', rtt: 30, loss: 0.002, relayed: false, ...over };
}

describe('buildLinks', () => {
  it('returns every unordered pair exactly once', () => {
    const links = buildLinks([peer('b'), peer('c'), peer('d')], {});

    expect(links).toHaveLength(6);
    const pairs = links.map((link) => `${link.a}|${link.b}`).sort();
    expect(pairs).toEqual(
      ['b|c', 'b|d', 'c|d', `${LOCAL_ID}|b`, `${LOCAL_ID}|c`, `${LOCAL_ID}|d`].sort(),
    );
  });

  it('prefers its own measurement for links it is part of', () => {
    const links = buildLinks([peer('b', good)], { b: [stat(LOCAL_ID, { rtt: 999 })] });
    const mine = links.find((link) => link.a === LOCAL_ID && link.b === 'b');

    expect(mine?.rtt).toBe(20);
    expect(mine?.firstHand).toBe(true);
  });

  it('takes the lower socketId report for links between two other peers', () => {
    const links = buildLinks([peer('b'), peer('c')], {
      b: [stat('c', { rtt: 11 })],
      c: [stat('b', { rtt: 77 })],
    });
    const theirs = links.find((link) => link.a === 'b' && link.b === 'c');

    expect(theirs?.rtt).toBe(11);
    expect(theirs?.firstHand).toBe(false);
  });

  it('falls back to the only report there is', () => {
    const links = buildLinks([peer('b'), peer('c')], { c: [stat('b', { rtt: 77 })] });

    expect(links.find((link) => link.a === 'b' && link.b === 'c')?.rtt).toBe(77);
  });

  it('draws a link with no figures when nobody has reported it', () => {
    const links = buildLinks([peer('b'), peer('c')], {});
    const theirs = links.find((link) => link.a === 'b' && link.b === 'c');

    expect(theirs).toBeDefined();
    expect(theirs?.bucket).toBeNull();
    expect(theirs?.rtt).toBeNull();
    expect(theirs?.relayed).toBe(false);
  });

  it('carries relayed through from whichever report won', () => {
    const links = buildLinks([peer('b'), peer('c')], { b: [stat('c', { relayed: true })] });

    expect(links.find((link) => link.a === 'b' && link.b === 'c')?.relayed).toBe(true);
  });

  it('drops links to a peer who has gone', () => {
    const links = buildLinks([peer('b')], { b: [stat('c')] });

    expect(links).toHaveLength(1);
    expect(links.every((link) => link.a !== 'c' && link.b !== 'c')).toBe(true);
  });

  it('is stable across ticks for the same input', () => {
    const stats = { b: [stat('c', { rtt: 11 })], c: [stat('b', { rtt: 77 })] };
    const first = buildLinks([peer('b'), peer('c')], stats);
    const second = buildLinks([peer('b'), peer('c')], stats);

    expect(second).toEqual(first);
  });
});
