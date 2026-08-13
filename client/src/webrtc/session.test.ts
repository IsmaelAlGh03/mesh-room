import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { createMeshSession, describeMediaError } from './session';

type Listener = (...args: never[]) => void;

function createFakeSocket() {
  const listeners = new Map<string, Set<Listener>>();

  const socket = {
    id: 'local-socket',
    connected: false,
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
      if (socket.connected) return socket;
      socket.connected = true;
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

function trackedStream() {
  const video = { kind: 'video', enabled: true, stop: vi.fn() };
  const audio = { kind: 'audio', enabled: true, stop: vi.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  return { stream, video, audio };
}

describe('joining with media already resolved', () => {
  it('uses the stream it was handed instead of asking for another', async () => {
    const getMedia = vi.fn();
    const { stream } = trackedStream();
    const session = createMeshSession({
      roomId: 'alpha',
      getSocket: () => createFakeSocket() as unknown as Socket,
      getMedia,
      createConnection: () => createStubConnection() as unknown as RTCPeerConnection,
    });

    await session.join({ displayName: 'Ada', stream });

    expect(getMedia).not.toHaveBeenCalled();
    expect(session.getState().localStream).toBe(stream);
  });

  it('announces the name it was given at join time', async () => {
    const socket = createFakeSocket();
    const { stream } = trackedStream();
    const session = createMeshSession({
      roomId: 'alpha',
      getSocket: () => socket as unknown as Socket,
      createConnection: () => createStubConnection() as unknown as RTCPeerConnection,
    });

    await session.join({ displayName: 'Ada', stream });

    expect(socket.emit).toHaveBeenCalledWith('join-room', { roomId: 'alpha', displayName: 'Ada' });
  });

  it('enters the room with the pre-toggles the green room was left in', async () => {
    const { stream, video, audio } = trackedStream();
    const session = createMeshSession({
      roomId: 'alpha',
      getSocket: () => createFakeSocket() as unknown as Socket,
      createConnection: () => createStubConnection() as unknown as RTCPeerConnection,
    });

    await session.join({ displayName: 'Ada', stream, micOn: false, cameraOn: true });

    expect(audio.enabled).toBe(false);
    expect(video.enabled).toBe(true);
    expect(session.getState().micOn).toBe(false);
    expect(session.getState().cameraOn).toBe(true);
  });

  it('announces itself on a socket the green room already connected', async () => {
    const socket = createFakeSocket();
    socket.connected = true;
    const { stream } = trackedStream();
    const session = createMeshSession({
      roomId: 'alpha',
      getSocket: () => socket as unknown as Socket,
      createConnection: () => createStubConnection() as unknown as RTCPeerConnection,
    });

    await session.join({ displayName: 'Ada', stream });

    expect(socket.emit).toHaveBeenCalledWith('join-room', { roomId: 'alpha', displayName: 'Ada' });
  });

  it('still falls back to getMedia when no stream is supplied', async () => {
    const getMedia = vi.fn(async () => emptyStream);
    const session = createMeshSession({
      roomId: 'alpha',
      getSocket: () => createFakeSocket() as unknown as Socket,
      getMedia,
      createConnection: () => createStubConnection() as unknown as RTCPeerConnection,
    });

    await session.join();

    expect(getMedia).toHaveBeenCalled();
  });
});

describe('describeMediaError', () => {
  const denied = new DOMException('denied', 'NotAllowedError');
  const insecure = new TypeError("Cannot read properties of undefined (reading 'getUserMedia')");

  it('names the secure connection when the page is not a secure context', () => {
    expect(describeMediaError(insecure, false)).toBe(
      'The camera and microphone need a secure connection. Open this page over HTTPS.',
    );
  });

  it('blames the secure context before the error, since mediaDevices is missing entirely', () => {
    expect(describeMediaError(denied, false)).toContain('secure connection');
  });

  it('still reports a blocked permission on a secure page', () => {
    expect(describeMediaError(denied, true)).toBe(
      'Your browser is blocking the camera and microphone. Allow them, then reload.',
    );
  });

  it('falls back to the generic message for an unknown error on a secure page', () => {
    expect(describeMediaError(new TypeError('something else'), true)).toBe(
      'The camera and microphone would not start. Reload to try again.',
    );
  });
});

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
