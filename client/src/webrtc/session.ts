import type { Socket } from 'socket.io-client';
import { getSocket } from '../socket';
import {
  CHUNK_BYTES,
  createReassembler,
  decodeChunk,
  encodeChunk,
  isAllowedImage,
  planChunks,
  rejectAttachment,
  type Reassembler,
} from './chunker';
import { createChannelLink, type ChannelLink } from './datachannel';
import { iceServers } from './ice';
import { openMedia, type MediaMode } from './media';
import { createPeerLink, isPolite, type PeerLink } from './peers';
import {
  deriveLink,
  readSample,
  settleBucket,
  type LinkQuality,
  type QualitySample,
} from './quality';
import type {
  ChatMessage,
  MeshMessage,
  Participant,
  PeerParticipant,
  PeerStat,
  SessionState,
  SessionStatus,
  SignalMessage,
} from '../types';

export interface MeshSessionOptions {
  roomId: string;
  displayName?: string;
  getSocket?: () => Socket;
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
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
  sendChat(text: string): void;
  sendAttachment(file: File): Promise<void>;
}

type SocketListener = (...args: any[]) => void;

const POLL_INTERVAL_MS = 2000;

interface PeerEntry {
  participant: Participant;
  link: PeerLink;
  channel: ChannelLink;
  inbound: Reassembler;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: LinkQuality | null;
  sample: QualitySample | null;
  streak: number;
  micOn: boolean;
  cameraOn: boolean;
}

export function createMeshSession(options: MeshSessionOptions): MeshSession {
  const {
    roomId,
    displayName: initialName = '',
    getSocket: resolveSocket = getSocket,
    getMedia = (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
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
  let mediaMode: MediaMode = 'full';
  let connectedAt: number | null = null;
  let messages: ChatMessage[] = [];
  let remoteStats: Record<string, PeerStat[]> = {};
  let attachmentError: string | null = null;
  let sentCount = 0;
  const objectUrls: string[] = [];
  let state: SessionState = {
    status,
    localStream: null,
    participants: [],
    messages: [],
    remoteStats: {},
    attachmentError: null,
    mediaError: null,
    mediaMode: 'full',
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
      micOn: entry.micOn,
      cameraOn: entry.cameraOn,
    }));

    state = {
      status,
      localStream,
      participants,
      messages,
      remoteStats,
      attachmentError,
      mediaError,
      mediaMode,
      micOn: tracksEnabled('audio'),
      cameraOn: tracksEnabled('video'),
      connectedAt,
    };
    for (const listener of listeners) listener();
  }

  function broadcast(message: MeshMessage): void {
    for (const entry of peers.values()) entry.channel.send(message);
  }

  function presence(): MeshMessage {
    return { type: 'presence', micOn: tracksEnabled('audio'), cameraOn: tracksEnabled('video') };
  }

  function ownStats(): MeshMessage {
    const links: PeerStat[] = [];

    for (const [peerId, entry] of peers) {
      if (entry.quality === null) continue;
      links.push({
        peerId,
        bucket: entry.quality.bucket,
        rtt: entry.quality.rtt,
        loss: entry.quality.loss,
        relayed: entry.quality.relayed,
      });
    }

    return { type: 'stats', at: Date.now(), links };
  }

  function receive(from: Participant, message: MeshMessage): void {
    const entry = peers.get(from.socketId);
    if (entry === undefined) return;

    if (message.type === 'chat') {
      messages = [
        ...messages,
        {
          id: message.id,
          authorId: from.socketId,
          authorName: entry.participant.displayName,
          text: message.text,
          at: message.at,
          mine: false,
        },
      ];
    } else if (message.type === 'presence') {
      entry.micOn = message.micOn;
      entry.cameraOn = message.cameraOn;
    } else if (message.type === 'stats') {
      remoteStats = { ...remoteStats, [from.socketId]: message.links };
    } else if (message.type === 'file-meta') {
      entry.inbound.begin(message);
      return;
    } else if (message.type === 'file-chunk') {
      const piece = decodeChunk(message.data);
      if (piece !== null) entry.inbound.accept(message.id, message.index, piece);
      return;
    } else {
      const done = entry.inbound.end(message.id);
      if (done === null) return;

      const mime = isAllowedImage(done.mime) ? done.mime : 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([done.bytes], { type: mime }));
      objectUrls.push(url);
      messages = [
        ...messages,
        {
          id: message.id,
          authorId: from.socketId,
          authorName: entry.participant.displayName,
          text: '',
          at: Date.now(),
          mine: false,
          attachment: { name: done.name, mime: done.mime, url, size: done.bytes.length },
        },
      ];
    }

    publish();
  }

  async function sendAttachment(file: File): Promise<void> {
    const refusal = rejectAttachment({ type: file.type, size: file.size });
    if (refusal !== null) {
      attachmentError = refusal;
      publish();
      return;
    }

    attachmentError = null;
    const id = `${socket?.id ?? 'local'}-f${(sentCount += 1)}`;
    const at = Date.now();
    const data = new Uint8Array(await file.arrayBuffer());
    const pieces = planChunks(data, CHUNK_BYTES);

    const url = URL.createObjectURL(new Blob([data], { type: file.type }));
    objectUrls.push(url);
    messages = [
      ...messages,
      {
        id,
        authorId: socket?.id ?? '',
        authorName: announcedName,
        text: '',
        at,
        mine: true,
        attachment: { name: file.name, mime: file.type, url, size: file.size },
      },
    ];
    publish();

    const stream: MeshMessage[] = [
      { type: 'file-meta', id, name: file.name, mime: file.type, size: file.size, chunks: pieces.length, at },
      ...pieces.map((piece, index) => ({
        type: 'file-chunk' as const,
        id,
        index,
        data: encodeChunk(piece),
      })),
      { type: 'file-end', id },
    ];

    await Promise.all([...peers.values()].map((entry) => entry.channel.sendPaced(stream)));
  }

  function sendChat(text: string): void {
    const trimmed = text.trim();
    if (trimmed === '') return;

    const id = `${socket?.id ?? 'local'}-${(sentCount += 1)}`;
    const at = Date.now();

    broadcast({ type: 'chat', id, text: trimmed, at });
    messages = [
      ...messages,
      { id, authorId: socket?.id ?? '', authorName: announcedName, text: trimmed, at, mine: true },
    ];
    publish();
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
    broadcast(presence());
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
      micOn: true,
      cameraOn: true,
      inbound: createReassembler(),
      channel: createChannelLink({
        connection,
        initiator,
        onMessage: (message) => receive(participant, message),
        onOpen: () => {
          entry.channel.send(presence());
          entry.channel.send(ownStats());
        },
      }),
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

    entry.channel.close();
    entry.link.close();
    peers.delete(socketId);
    delete remoteStats[socketId];
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
    if (!measured.some(Boolean)) return;

    broadcast(ownStats());
    publish();
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
      mediaMode = 'full';
      mediaError = null;
    } else {
      const opened = await openMedia((constraints) => getMedia(constraints));
      localStream = opened.stream;
      mediaMode = opened.mode;
      mediaError = opened.error;
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
    messages = [];
    remoteStats = {};
    attachmentError = null;

    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.length = 0;
    publish();
  }

  function reset(): void {
    status = 'idle';
    mediaError = null;
    mediaMode = 'full';
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
    sendChat,
    sendAttachment,
  };
}
