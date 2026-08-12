import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createMeshSession, type MeshSession } from './session';
import type { SessionState } from '../types';

export function useWebRTC(roomId: string, displayName = ''): SessionState {
  const held = useRef<{ roomId: string; session: MeshSession } | null>(null);

  if (held.current === null || held.current.roomId !== roomId) {
    held.current = { roomId, session: createMeshSession({ roomId, displayName }) };
  }

  const { session } = held.current;

  useEffect(() => {
    void session.join();
    return () => session.leave();
  }, [session]);

  return useSyncExternalStore(session.subscribe, session.getState);
}
