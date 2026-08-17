import { describe, expect, it } from 'vitest';
import { LOCAL_ID } from './mesh-links';
import { lostContest, stageHolder } from './stage';
import type { PeerParticipant } from '../types';

function peer(socketId: string, over: Partial<PeerParticipant> = {}): PeerParticipant {
  return {
    socketId,
    displayName: socketId,
    stream: null,
    screenStream: null,
    connectionState: 'connected',
    quality: null,
    micOn: true,
    cameraOn: true,
    lost: false,
    sharing: null,
    ...over,
  };
}

describe('stageHolder', () => {
  it('is nobody when nobody is sharing', () => {
    expect(stageHolder([peer('b'), peer('c')], 'a', null)).toBeNull();
  });

  it('names the peer who is sharing', () => {
    expect(stageHolder([peer('b', { sharing: 'stream-1' }), peer('c')], 'a', null)).toBe('b');
  });

  it('names you as local rather than by socket id', () => {
    expect(stageHolder([peer('b')], 'a', 'stream-mine')).toBe(LOCAL_ID);
  });

  it('gives a contest to the lower socket id, the rule used everywhere else', () => {
    const contest = [peer('b', { sharing: 's1' }), peer('c', { sharing: 's2' })];

    expect(stageHolder(contest, 'd', null)).toBe('b');
    expect(stageHolder(contest, 'a', 'mine')).toBe(LOCAL_ID);
    expect(stageHolder(contest, 'z', 'mine')).toBe('b');
  });

  it('releases the stage when a lost peer was holding it', () => {
    expect(stageHolder([peer('b', { sharing: 's1', lost: true })], 'a', null)).toBeNull();
  });

  it('passes the stage on when the holder is lost and someone else is sharing', () => {
    const peers = [peer('b', { sharing: 's1', lost: true }), peer('c', { sharing: 's2' })];

    expect(stageHolder(peers, 'a', null)).toBe('c');
  });

  it('releases the stage when the holder stops claiming it', () => {
    expect(stageHolder([peer('b', { sharing: null })], 'a', null)).toBeNull();
  });

  it('tells a beaten sharer to stop, so nobody transmits a screen no one can see', () => {
    expect(lostContest([peer('b', { sharing: 's1' })], 'c', 'mine')).toBe(true);
    expect(lostContest([peer('b', { sharing: 's1' })], 'a', 'mine')).toBe(false);
  });

  it('does not tell you to stop when you are not sharing at all', () => {
    expect(lostContest([peer('b', { sharing: 's1' })], 'c', null)).toBe(false);
  });

  it('does not yield to a peer whose link is lost', () => {
    expect(lostContest([peer('b', { sharing: 's1', lost: true })], 'c', 'mine')).toBe(false);
  });
});
