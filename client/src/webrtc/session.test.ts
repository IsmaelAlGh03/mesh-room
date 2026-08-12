import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { createMeshSession } from './session';

type Listener = (...args: never[]) => void;

function createFakeSocket() {
  const listeners = new Map<string, Set<Listener>>();

  const socket = {
    id: 'local-socket',
    emit: vi.fn(),
    on(event: string, handler: Listener) {
      const existing = listeners.get(event) ?? new Set<Listener>();
      existing.add(handler);
      listeners.set(event, existing);
      return socket;
    },
    off(event: string, handler: Listener) {
      listeners.get(event)?.delete(handler);
      return socket;
    },
    connect() {
      socket.fire('connect');
      return socket;
    },
    disconnect: vi.fn(),
    fire(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) ?? []) {
        (handler as (...values: unknown[]) => void)(...args);
      }
    },
  };

  return socket;
}

function createStubConnection() {
  return {
    connectionState: 'new',
    signalingState: 'stable',
    localDescription: null,
    addTrack: vi.fn(),
    addTransceiver: vi.fn(),
    addEventListener: vi.fn(),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    addIceCandidate: vi.fn(),
    close: vi.fn(),
  };
}

const emptyStream = {
  getTracks: () => [],
  getVideoTracks: () => [],
  getAudioTracks: () => [],
} as unknown as MediaStream;

describe('createMeshSession', () => {
  it('tears down only the departing peer', async () => {
    const socket = createFakeSocket();
    const connections: ReturnType<typeof createStubConnection>[] = [];

    const session = createMeshSession({
      roomId: 'test-room',
      getSocket: () => socket as unknown as Socket,
      getMedia: async () => emptyStream,
      createConnection: () => {
        const connection = createStubConnection();
        connections.push(connection);
        return connection as unknown as RTCPeerConnection;
      },
    });

    await session.join();
    socket.fire('existing-peers', [
      { socketId: 'peer-1', displayName: 'One' },
      { socketId: 'peer-2', displayName: 'Two' },
      { socketId: 'peer-3', displayName: 'Three' },
    ]);

    socket.fire('peer-left', { socketId: 'peer-2' });

    const [first, second, third] = connections;
    expect(second?.close).toHaveBeenCalledTimes(1);
    expect(first?.close).not.toHaveBeenCalled();
    expect(third?.close).not.toHaveBeenCalled();
    expect(session.getState().participants.map((peer) => peer.socketId)).toEqual([
      'peer-1',
      'peer-3',
    ]);
  });
});
