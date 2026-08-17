import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createMeshSession, type JoinDetails, type MeshSession } from './session';
import type { SessionState } from '../types';

export interface RoomControls extends SessionState {
  join: (details: JoinDetails) => void;
  leave: () => void;
  reset: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  startShare: () => void;
  stopShare: () => void;
  sendChat: (text: string) => void;
  sendAttachment: (file: File) => void;
}

export function useWebRTC(roomId: string): RoomControls {
  const held = useRef<{ roomId: string; session: MeshSession } | null>(null);

  if (held.current === null || held.current.roomId !== roomId) {
    held.current = { roomId, session: createMeshSession({ roomId }) };
  }

  const { session } = held.current;

  useEffect(() => () => session.leave(), [session]);

  const state = useSyncExternalStore(session.subscribe, session.getState);

  return {
    ...state,
    join: (details: JoinDetails) => void session.join(details),
    leave: session.leave,
    reset: session.reset,
    toggleMic: session.toggleMic,
    toggleCamera: session.toggleCamera,
    startShare: () => void session.startShare(),
    stopShare: session.stopShare,
    sendChat: session.sendChat,
    sendAttachment: (file: File) => void session.sendAttachment(file),
  };
}
