import { beforeEach, describe, expect, it } from 'vitest';
import { createRoomStore, MAX_ROOM_SIZE, type RoomStore } from '../rooms';

function fill(store: RoomStore, roomId: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    store.join(roomId, `socket-${i}`, `Peer ${i}`);
  }
}

describe('room store', () => {
  let store: RoomStore;

  beforeEach(() => {
    store = createRoomStore();
  });

  describe('join', () => {
    it('gives the first participant an empty peer list', () => {
      const result = store.join('alpha', 'socket-a', 'Ada');

      expect(result).toEqual({
        ok: true,
        participant: { socketId: 'socket-a', displayName: 'Ada' },
        peers: [],
      });
    });

    it('shows a joiner the existing members but not itself', () => {
      store.join('alpha', 'socket-a', 'Ada');
      const result = store.join('alpha', 'socket-b', 'Bo');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.peers).toEqual([{ socketId: 'socket-a', displayName: 'Ada' }]);
    });

    it('accepts the sixth participant and rejects the seventh', () => {
      fill(store, 'alpha', MAX_ROOM_SIZE - 1);

      expect(store.isFull('alpha')).toBe(false);
      expect(store.join('alpha', 'socket-sixth', 'Sixth').ok).toBe(true);
      expect(store.isFull('alpha')).toBe(true);

      expect(store.join('alpha', 'socket-seventh', 'Seventh')).toEqual({
        ok: false,
        reason: 'room-full',
      });
      expect(store.size('alpha')).toBe(MAX_ROOM_SIZE);
    });

    it('frees the slot taken by a participant who leaves', () => {
      fill(store, 'alpha', MAX_ROOM_SIZE);
      store.leave('socket-0');

      expect(store.isFull('alpha')).toBe(false);
      expect(store.join('alpha', 'socket-late', 'Late').ok).toBe(true);
    });

    it('replaces the entry when the same socket joins twice', () => {
      store.join('alpha', 'socket-a', 'Ada');
      const result = store.join('alpha', 'socket-a', 'Ada Renamed');

      expect(store.size('alpha')).toBe(1);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.participant.displayName).toBe('Ada Renamed');
      expect(result.peers).toEqual([]);
    });

    it('drops the old membership when a socket joins a different room', () => {
      store.join('alpha', 'socket-a', 'Ada');
      store.join('beta', 'socket-a', 'Ada');

      expect(store.peers('alpha')).toEqual([]);
      expect(store.roomCount()).toBe(1);
      expect(store.leave('socket-a')).toMatchObject({ roomId: 'beta' });
    });

    it('keeps rooms independent', () => {
      store.join('alpha', 'socket-a', 'Ada');
      store.join('beta', 'socket-b', 'Bo');

      expect(store.peers('alpha')).toEqual([{ socketId: 'socket-a', displayName: 'Ada' }]);
      expect(store.peers('beta')).toEqual([{ socketId: 'socket-b', displayName: 'Bo' }]);
      expect(store.roomCount()).toBe(2);
    });
  });

  describe('display names', () => {
    it('trims surrounding whitespace', () => {
      const result = store.join('alpha', 'socket-a', '  Ada  ');

      expect(result.ok && result.participant.displayName).toBe('Ada');
    });

    it('falls back to Guest when the name is blank', () => {
      const result = store.join('alpha', 'socket-a', '   ');

      expect(result.ok && result.participant.displayName).toBe('Guest');
    });

    it('caps the name at 32 characters', () => {
      const result = store.join('alpha', 'socket-a', 'x'.repeat(80));

      expect(result.ok && result.participant.displayName).toBe('x'.repeat(32));
    });

    it('allows duplicate names because socket id is the identity', () => {
      store.join('alpha', 'socket-a', 'Ada');
      const result = store.join('alpha', 'socket-b', 'Ada');

      expect(result.ok).toBe(true);
      expect(store.size('alpha')).toBe(2);
    });
  });

  describe('leave', () => {
    it('reports the room and participant that left', () => {
      store.join('alpha', 'socket-a', 'Ada');

      expect(store.leave('socket-a')).toEqual({
        roomId: 'alpha',
        participant: { socketId: 'socket-a', displayName: 'Ada' },
      });
    });

    it('returns null for a socket that was never in a room', () => {
      expect(store.leave('socket-ghost')).toBeNull();
    });

    it('returns null when the same socket leaves twice', () => {
      store.join('alpha', 'socket-a', 'Ada');
      store.leave('socket-a');

      expect(store.leave('socket-a')).toBeNull();
    });

    it('leaves the remaining participants untouched', () => {
      store.join('alpha', 'socket-a', 'Ada');
      store.join('alpha', 'socket-b', 'Bo');
      store.leave('socket-a');

      expect(store.peers('alpha')).toEqual([{ socketId: 'socket-b', displayName: 'Bo' }]);
    });

    it('deletes the room once the last participant leaves', () => {
      store.join('alpha', 'socket-a', 'Ada');
      store.join('alpha', 'socket-b', 'Bo');

      store.leave('socket-a');
      expect(store.roomCount()).toBe(1);

      store.leave('socket-b');
      expect(store.roomCount()).toBe(0);
      expect(store.peers('alpha')).toEqual([]);
      expect(store.size('alpha')).toBe(0);
    });
  });

  describe('queries on an unknown room', () => {
    it('reports empty and not full', () => {
      expect(store.peers('nowhere')).toEqual([]);
      expect(store.size('nowhere')).toBe(0);
      expect(store.isFull('nowhere')).toBe(false);
    });
  });
});
