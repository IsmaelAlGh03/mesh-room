export const MAX_ROOM_SIZE = 6;

const MAX_DISPLAY_NAME_LENGTH = 32;
const DEFAULT_DISPLAY_NAME = 'Guest';

export interface Participant {
  socketId: string;
  displayName: string;
}

export type JoinResult =
  | { ok: true; participant: Participant; peers: Participant[] }
  | { ok: false; reason: 'room-full' };

export interface Departure {
  roomId: string;
  participant: Participant;
}

export interface RoomStore {
  join(roomId: string, socketId: string, displayName: string): JoinResult;
  leave(socketId: string): Departure | null;
  peers(roomId: string, excludeSocketId?: string): Participant[];
  isFull(roomId: string): boolean;
  size(roomId: string): number;
  roomCount(): number;
}

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return trimmed === '' ? DEFAULT_DISPLAY_NAME : trimmed;
}

export function createRoomStore(): RoomStore {
  const rooms = new Map<string, Map<string, Participant>>();
  const socketRooms = new Map<string, string>();

  function leave(socketId: string): Departure | null {
    const roomId = socketRooms.get(socketId);
    if (roomId === undefined) return null;

    socketRooms.delete(socketId);

    const members = rooms.get(roomId);
    const participant = members?.get(socketId);
    if (members === undefined || participant === undefined) return null;

    members.delete(socketId);
    if (members.size === 0) {
      rooms.delete(roomId);
    }

    return { roomId, participant };
  }

  function join(roomId: string, socketId: string, displayName: string): JoinResult {
    const previousRoomId = socketRooms.get(socketId);
    if (previousRoomId !== undefined && previousRoomId !== roomId) {
      leave(socketId);
    }

    const members = rooms.get(roomId) ?? new Map<string, Participant>();

    if (!members.has(socketId) && members.size >= MAX_ROOM_SIZE) {
      return { ok: false, reason: 'room-full' };
    }

    const peers = [...members.values()].filter((peer) => peer.socketId !== socketId);
    const participant: Participant = {
      socketId,
      displayName: normalizeDisplayName(displayName),
    };

    members.set(socketId, participant);
    rooms.set(roomId, members);
    socketRooms.set(socketId, roomId);

    return { ok: true, participant, peers };
  }

  function peers(roomId: string, excludeSocketId?: string): Participant[] {
    const members = rooms.get(roomId);
    if (members === undefined) return [];
    return [...members.values()].filter((peer) => peer.socketId !== excludeSocketId);
  }

  return {
    join,
    leave,
    peers,
    isFull: (roomId) => (rooms.get(roomId)?.size ?? 0) >= MAX_ROOM_SIZE,
    size: (roomId) => rooms.get(roomId)?.size ?? 0,
    roomCount: () => rooms.size,
  };
}
