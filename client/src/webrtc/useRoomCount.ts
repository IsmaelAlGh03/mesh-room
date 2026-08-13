import { useEffect, useState } from 'react';
import { getSocket } from '../socket';

export interface RoomOccupancy {
  count: number | null;
  capacity: number;
}

const DEFAULT_CAPACITY = 6;

export function useRoomCount(roomId: string, watching: boolean): RoomOccupancy {
  const [occupancy, setOccupancy] = useState<RoomOccupancy>({
    count: null,
    capacity: DEFAULT_CAPACITY,
  });

  useEffect(() => {
    if (!watching || roomId === '') return;

    const socket = getSocket();
    const receive = (next: RoomOccupancy): void => setOccupancy(next);
    const ask = (): void => void socket.emit('watch-room', { roomId });

    socket.on('room-count', receive);
    socket.on('connect', ask);
    if (socket.connected) ask();
    else socket.connect();

    return () => {
      if (socket.connected) socket.emit('unwatch-room', { roomId });
      socket.off('room-count', receive);
      socket.off('connect', ask);
    };
  }, [roomId, watching]);

  return occupancy;
}
