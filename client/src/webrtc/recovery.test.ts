import { describe, expect, it } from 'vitest';
import { nextAction, type RecoveryState } from './recovery';

const fresh: RecoveryState = { attempts: 0, relayTried: false };
const driver = { canOffer: true, hasTurn: false };

describe('nextAction', () => {
  it('is idle while the connection is healthy or still coming up', () => {
    for (const state of ['new', 'connecting', 'connected'] as RTCPeerConnectionState[]) {
      expect(nextAction(state, fresh, driver)).toBe('idle');
    }
  });

  it('waits out a disconnect, which often heals itself', () => {
    expect(nextAction('disconnected', fresh, driver)).toBe('wait');
  });

  it('restarts a failed link while attempts remain', () => {
    expect(nextAction('failed', fresh, driver)).toBe('restart');
    expect(nextAction('failed', { attempts: 1, relayTried: false }, driver)).toBe('restart');
  });

  it('escalates to relay once restarts are spent and TURN exists', () => {
    const spent = { attempts: 2, relayTried: false };
    expect(nextAction('failed', spent, { canOffer: true, hasTurn: true })).toBe('relay');
  });

  it('gives up rather than relaying when there is no TURN server', () => {
    expect(nextAction('failed', { attempts: 2, relayTried: false }, driver)).toBe('lost');
  });

  it('gives up once relay has been tried', () => {
    const tried = { attempts: 2, relayTried: true };
    expect(nextAction('failed', tried, { canOffer: true, hasTurn: true })).toBe('lost');
  });

  it('parks the polite peer in wait, because it never drives recovery', () => {
    const passenger = { canOffer: false, hasTurn: true };
    expect(nextAction('failed', fresh, passenger)).toBe('wait');
    expect(nextAction('failed', { attempts: 9, relayTried: true }, passenger)).toBe('wait');
  });

  it('treats a closed connection as terminal for either peer', () => {
    expect(nextAction('closed', fresh, driver)).toBe('lost');
    expect(nextAction('closed', fresh, { canOffer: false, hasTurn: true })).toBe('lost');
  });

  it('does not mutate the state it is given', () => {
    const state = { attempts: 0, relayTried: false };
    nextAction('failed', state, driver);
    expect(state).toEqual({ attempts: 0, relayTried: false });
  });
});
