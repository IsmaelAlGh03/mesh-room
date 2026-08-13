import type { Server as IOServer } from 'socket.io';
import { createRoomStore, MAX_ROOM_SIZE, type RoomStore } from '../rooms';

interface JoinRoomPayload {
  roomId?: unknown;
  displayName?: unknown;
}

interface SignalPayload {
  to?: unknown;
  data?: unknown;
}

interface WatchRoomPayload {
  roomId?: unknown;
}

const watchChannel = (roomId: string): string => `watch:${roomId}`;

export function registerSignaling(io: IOServer, store: RoomStore = createRoomStore()): RoomStore {
  function publishCount(roomId: string): void {
    io.to(watchChannel(roomId)).emit('room-count', {
      count: store.size(roomId),
      capacity: MAX_ROOM_SIZE,
    });
  }

  io.on('connection', (socket) => {
    socket.on('watch-room', ({ roomId }: WatchRoomPayload = {}) => {
      if (typeof roomId !== 'string' || roomId === '') return;
      void socket.join(watchChannel(roomId));
      socket.emit('room-count', { count: store.size(roomId), capacity: MAX_ROOM_SIZE });
    });

    socket.on('unwatch-room', ({ roomId }: WatchRoomPayload = {}) => {
      if (typeof roomId !== 'string' || roomId === '') return;
      void socket.leave(watchChannel(roomId));
    });

    socket.on('join-room', ({ roomId, displayName }: JoinRoomPayload = {}) => {
      if (typeof roomId !== 'string' || roomId === '') return;

      const result = store.join(roomId, socket.id, typeof displayName === 'string' ? displayName : '');

      if (!result.ok) {
        socket.emit('room-full');
        return;
      }

      void socket.leave(watchChannel(roomId));
      socket.join(roomId);
      socket.emit('existing-peers', result.peers);
      socket.to(roomId).emit('peer-joined', result.participant);
      publishCount(roomId);
    });

    socket.on('signal', ({ to, data }: SignalPayload = {}) => {
      if (typeof to !== 'string') return;
      io.to(to).emit('signal', { from: socket.id, data });
    });

    socket.on('disconnect', () => {
      const departure = store.leave(socket.id);
      if (departure === null) return;
      io.to(departure.roomId).emit('peer-left', { socketId: socket.id });
      publishCount(departure.roomId);
    });
  });

  return store;
}
