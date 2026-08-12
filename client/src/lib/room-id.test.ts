import { describe, expect, it } from 'vitest';
import { createRoomId, parseRoomId } from './room-id';

describe('createRoomId', () => {
  it('reads as two words and a number', () => {
    expect(createRoomId()).toMatch(/^[a-z]+-[a-z]+-\d{1,2}$/);
  });

  it('rarely repeats itself', () => {
    const ids = new Set(Array.from({ length: 200 }, createRoomId));

    expect(ids.size).toBeGreaterThan(150);
  });
});

describe('parseRoomId', () => {
  it('accepts a bare room name', () => {
    expect(parseRoomId('quiet-harbor-41')).toBe('quiet-harbor-41');
  });

  it('pulls the room out of a full link', () => {
    expect(parseRoomId('https://mesh-room.app/room/quiet-harbor-41')).toBe('quiet-harbor-41');
  });

  it('ignores a trailing slash and query string', () => {
    expect(parseRoomId('https://mesh-room.app/room/quiet-harbor-41/?x=1')).toBe('quiet-harbor-41');
  });

  it('trims and lowercases what was pasted', () => {
    expect(parseRoomId('  Quiet-Harbor-41  ')).toBe('quiet-harbor-41');
  });

  it('rejects an empty entry', () => {
    expect(parseRoomId('   ')).toBeNull();
  });

  it('rejects characters that cannot appear in a room name', () => {
    expect(parseRoomId('quiet harbor/41')).toBeNull();
  });
});
