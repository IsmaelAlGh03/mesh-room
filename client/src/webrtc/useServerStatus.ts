import { useEffect, useState } from 'react';
import { getSocket } from '../socket';

const WAKING_AFTER_MS = 3000;

export interface ServerStatus {
  connected: boolean;
  waking: boolean;
}

export function useServerStatus(): ServerStatus {
  const [connected, setConnected] = useState(() => getSocket().connected);
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const open = (): void => {
      setConnected(true);
      setWaking(false);
    };
    const shut = (): void => setConnected(false);

    socket.on('connect', open);
    socket.on('disconnect', shut);
    if (socket.connected) open();

    const slow = setTimeout(() => setWaking(!getSocket().connected), WAKING_AFTER_MS);

    return () => {
      clearTimeout(slow);
      socket.off('connect', open);
      socket.off('disconnect', shut);
    };
  }, []);

  return { connected, waking };
}
