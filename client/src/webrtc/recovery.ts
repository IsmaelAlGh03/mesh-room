export type RecoveryAction = 'idle' | 'wait' | 'restart' | 'relay' | 'lost';

export interface RecoveryState {
  attempts: number;
  relayTried: boolean;
}

export interface RecoveryOptions {
  canOffer: boolean;
  hasTurn: boolean;
}

export const GRACE_MS = 4000;
export const MAX_RESTARTS = 2;

export function nextAction(
  connectionState: RTCPeerConnectionState,
  state: RecoveryState,
  options: RecoveryOptions,
): RecoveryAction {
  if (connectionState === 'closed') return 'lost';
  if (connectionState === 'disconnected') return 'wait';
  if (connectionState !== 'failed') return 'idle';

  // Exactly one peer per pair is impolite; only it offers, so only it can restart.
  if (!options.canOffer) return 'wait';
  if (state.attempts < MAX_RESTARTS) return 'restart';
  if (options.hasTurn && !state.relayTried) return 'relay';
  return 'lost';
}
