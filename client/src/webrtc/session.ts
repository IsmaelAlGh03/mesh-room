import type { Socket } from 'socket.io-client';
import { getSocket } from '../socket';
import { iceServers } from './ice';
import { createPeerLink, isPolite, type PeerLink } from './peers';
import {
  deriveLink,
  readSample,
  settleBucket,
  type LinkQuality,
  type QualitySample,
} from './quality';
import type {
  Participant,
  PeerParticipant,
  SessionState,
  SessionStatus,
  SignalMessage,
} from '../types';

export interface MeshSessionOptions {
  roomId: string;
  displayName?: string;
  getSocket?: () => Socket;
  getMedia?: () => Promise<MediaStream>;
  createConnection?: () => RTCPeerConnection;
}

export interface JoinDetails {
  displayName?: string;
  stream?: MediaStream;
  micOn?: boolean;
  cameraOn?: boolean;
}

export interface MeshSession {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  join(details?: JoinDetails): Promise<void>;
  leave(): void;
  reset(): void;
  toggleMic(): void;
  toggleCamera(): void;
}

type SocketListener = (...args: any[]) => void;

const POLL_INTERVAL_MS = 2000;

interface PeerEntry {
  participant: Participant;
  link: PeerLink;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: LinkQuality | null;
  sample: QualitySample | null;
  streak: number;
}

export function describeMediaError(
  error: unknown,
  secureContext: boolean = window.isSecureContext,
): string {
  const name = error instanceof DOMException ? error.name : '';

  // Off a secure origin there is no navigator.mediaDevices at all, so no error name is meaningful.
  if (!secureContext) {
    return 'The camera and microphone need a secure connection. Open this page over HTTPS.';
  }
  if (name === 'NotAllowedError') {
    return 'Your browser is blocking the camera and microphone. Allow them, then reload.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using your camera. Close it, then reload.';
  }
  if (name === 'NotFoundError') {
    return 'No camera or microphone found. Connect one, then reload.';
  }
  return 'The camera and microphone would not start. Reload to try again.';
}

export function createMeshSession(options: MeshSessionOptions): MeshSession {
  const {
    roomId,
    displayName: initialName = '',
    getSocket: resolveSocket = getSocket,
    getMedia = () => navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
    createConnection = () => new RTCPeerConnection({ iceServers: iceServers() }),
  } = options;

  const peers = new Map<string, PeerEntry>();
  const listeners = new Set<() => void>();
  const bindings: [string, SocketListener][] = [];

  let socket: Socket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let status: SessionStatus = 'idle';
  let announcedName = initialName;
  let localStream: MediaStream | null = null;
  let mediaError: string | null = null;
  let connectedAt: number | null = null;
  let state: SessionState = {
    status,
    localStream: null,
    participants: [],
    mediaError: null,
    micOn: false,
    cameraOn: false,
    connectedAt: null,
  };

  function tracksEnabled(kind: 'audio' | 'video'): boolean {
    const tracks =
      kind === 'audio' ? (localStream?.getAudioTracks() ?? []) : (localStream?.getVideoTracks() ?? []);
    return tracks.some((track) => track.enabled);
  }

  function publish(): void {
    const participants: PeerParticipant[] = [...peers.values()].map((entry) => ({
      ...entry.participant,
      stream: entry.stream,
      connectionState: entry.connectionState,
      quality: entry.quality,
    }));

    state = {
      status,
      localStream,
      participants,
      mediaError,
      micOn: tracksEnabled('audio'),
      cameraOn: tracksEnabled('video'),
      connectedAt,
    };
    for (const listener of listeners) listener();
  }

  function setEnabled(kind: 'audio' | 'video', enabled: boolean): void {
    const tracks =
      kind === 'audio' ? (localStream?.getAudioTracks() ?? []) : (localStream?.getVideoTracks() ?? []);
    for (const track of tracks) track.enabled = enabled;
  }

  function toggle(kind: 'audio' | 'video'): void {
    const tracks =
      kind === 'audio' ? (localStream?.getAudioTracks() ?? []) : (localStream?.getVideoTracks() ?? []);
    if (tracks.length === 0) return;

    setEnabled(kind, !tracksEnabled(kind));
    publish();
  }

  function bind<Args extends unknown[]>(event: string, handler: (...args: Args) => void): void {
    const listener = handler as SocketListener;
    bindings.push([event, listener]);
    socket?.on(event, listener);
  }

  function addPeer(participant: Participant, initiator: boolean): void {
    if (peers.has(participant.socketId)) return;

    const connection = createConnection();
    const entry: PeerEntry = {
      participant,
      connection,
      stream: null,
      connectionState: 'new',
      quality: null,
      sample: null,
      streak: 0,
      link: createPeerLink({
        connection,
        polite: isPolite(socket?.id ?? '', participant.socketId),
        initiator,
        send: (data) => socket?.emit('signal', { to: participant.socketId, data }),
        onTrack: (stream) => {
          entry.stream = stream;
          publish();
        },
        onStateChange: (connectionState) => {
          entry.connectionState = connectionState;
          publish();
        },
      }),
    };

    peers.set(participant.socketId, entry);
    startPolling();

    if (localStream !== null) {
      for (const track of localStream.getTracks()) connection.addTrack(track, localStream);
    } else if (initiator) {
      connection.addTransceiver('video', { direction: 'recvonly' });
      connection.addTransceiver('audio', { direction: 'recvonly' });
    }

    publish();
  }

  function removePeer(socketId: string): void {
    const entry = peers.get(socketId);
    if (entry === undefined) return;

    entry.link.close();
    peers.delete(socketId);
    if (peers.size === 0) stopPolling();
    publish();
  }

  async function measure(entry: PeerEntry): Promise<boolean> {
    let report: RTCStatsReport;
    try {
      report = await entry.connection.getStats();
    } catch {
      return false;
    }

    const sample = readSample(report, Date.now());
    if (sample === null) return false;

    const measured = deriveLink(entry.sample, sample);
    const settled = settleBucket(
      entry.quality?.bucket ?? measured.bucket,
      measured.bucket,
      entry.streak,
    );

    entry.sample = sample;
    entry.streak = settled.streak;
    entry.quality = { ...measured, bucket: settled.bucket };
    return true;
  }

  async function pollQuality(): Promise<void> {
    const measured = await Promise.all([...peers.values()].map(measure));
    if (measured.some(Boolean)) publish();
  }

  function startPolling(): void {
    if (pollTimer !== null) return;
    pollTimer = setInterval(() => void pollQuality(), POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (pollTimer === null) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  async function join(details: JoinDetails = {}): Promise<void> {
    status = 'connecting';
    if (details.displayName !== undefined) announcedName = details.displayName;
    publish();

    if (details.stream !== undefined) {
      localStream = details.stream;
      mediaError = null;
    } else {
      try {
        localStream = await getMedia();
      } catch (error) {
        mediaError = describeMediaError(error);
      }
    }

    if (details.micOn !== undefined) setEnabled('audio', details.micOn);
    if (details.cameraOn !== undefined) setEnabled('video', details.cameraOn);
    publish();

    socket = resolveSocket();

    const announce = (): void => {
      socket?.emit('join-room', { roomId, displayName: announcedName });
    };

    bind('connect', announce);

    bind('existing-peers', (existing: Participant[]) => {
      status = 'connected';
      connectedAt ??= Date.now();
      for (const participant of existing) addPeer(participant, true);
      publish();
    });

    bind('peer-joined', (participant: Participant) => addPeer(participant, false));

    bind('signal', ({ from, data }: SignalMessage) => {
      peers.get(from)?.link.accept(data).catch(reportSignalFailure);
    });

    bind('peer-left', ({ socketId }: { socketId: string }) => removePeer(socketId));

    bind('room-full', () => {
      status = 'room-full';
      publish();
    });

    // PreJoin connects this socket to watch the count, so 'connect' may never fire again.
    if (socket.connected) announce();
    else socket.connect();
  }

  function reportSignalFailure(error: unknown): void {
    console.error('mesh-room: negotiation failed', error);
  }

  function leave(): void {
    stopPolling();
    for (const socketId of [...peers.keys()]) removePeer(socketId);

    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;

    for (const [event, handler] of bindings) socket?.off(event, handler);
    bindings.length = 0;

    socket?.disconnect();
    socket = null;
    status = 'left';
    connectedAt = null;
    publish();
  }

  function reset(): void {
    status = 'idle';
    mediaError = null;
    publish();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    join,
    leave,
    reset,
    toggleMic: () => toggle('audio'),
    toggleCamera: () => toggle('video'),
  };
}
