import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createMeshSession, type MeshSession } from './session';
import type { SessionState } from '../types';

export interface RoomControls extends SessionState {
  rejoin: () => void;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

export function useWebRTC(roomId: string, displayName = ''): RoomControls {
  const held = useRef<{ roomId: string; session: MeshSession } | null>(null);

  if (held.current === null || held.current.roomId !== roomId) {
    held.current = { roomId, session: createMeshSession({ roomId, displayName }) };
  }

  const { session } = held.current;

  useEffect(() => {
    void session.join();
    return () => session.leave();
  }, [session]);

  const state = useSyncExternalStore(session.subscribe, session.getState);

  return {
    ...state,
    rejoin: () => void session.join(),
    leave: session.leave,
    toggleMic: session.toggleMic,
    toggleCamera: session.toggleCamera,
  };
}
