import type { Server as IOServer } from 'socket.io';
import { createRoomStore, type RoomStore } from '../rooms';

interface JoinRoomPayload {
  roomId?: unknown;
  displayName?: unknown;
}

interface SignalPayload {
  to?: unknown;
  data?: unknown;
}

export function registerSignaling(io: IOServer, store: RoomStore = createRoomStore()): RoomStore {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, displayName }: JoinRoomPayload = {}) => {
      if (typeof roomId !== 'string' || roomId === '') return;

      const result = store.join(roomId, socket.id, typeof displayName === 'string' ? displayName : '');

      if (!result.ok) {
        socket.emit('room-full');
        return;
      }

      socket.join(roomId);
      socket.emit('existing-peers', result.peers);
      socket.to(roomId).emit('peer-joined', result.participant);
    });

    socket.on('signal', ({ to, data }: SignalPayload = {}) => {
      if (typeof to !== 'string') return;
      io.to(to).emit('signal', { from: socket.id, data });
    });

    socket.on('disconnect', () => {
      const departure = store.leave(socket.id);
      if (departure === null) return;
      io.to(departure.roomId).emit('peer-left', { socketId: socket.id });
    });
  });

  return store;
}
