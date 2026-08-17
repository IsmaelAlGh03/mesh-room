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
import { hasTurn, iceServers } from './ice';
import { openMedia, type MediaMode } from './media';
import { createPeerLink, isPolite, type PeerLink } from './peers';
import { GRACE_MS, nextAction, type RecoveryState } from './recovery';
import { lostContest, type StageClaimant } from './stage';
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
  getDisplay?: () => Promise<MediaStream>;
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
  startShare(): Promise<void>;
  stopShare(): void;
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
  screenStream: MediaStream | null;
  sharing: string | null;
  inboundStreams: MediaStream[];
  connectionState: RTCPeerConnectionState;
  quality: LinkQuality | null;
  sample: QualitySample | null;
  streak: number;
  micOn: boolean;
  cameraOn: boolean;
  recovery: RecoveryState;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  lost: boolean;
}

export function createMeshSession(options: MeshSessionOptions): MeshSession {
  const {
    roomId,
    displayName: initialName = '',
    getSocket: resolveSocket = getSocket,
    getMedia = (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    getDisplay = () => navigator.mediaDevices.getDisplayMedia({ video: true }),
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
  let screenStream: MediaStream | null = null;
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
    screenStream: null,
    sharing: null,
    localId: '',
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
      screenStream: entry.screenStream,
      connectionState: entry.connectionState,
      quality: entry.quality,
      micOn: entry.micOn,
      cameraOn: entry.cameraOn,
      lost: entry.lost,
      sharing: entry.sharing,
    }));

    state = {
      status,
      localStream,
      screenStream,
      sharing: screenStream?.id ?? null,
      localId: socket?.id ?? '',
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

  function claimants(): StageClaimant[] {
    return [...peers.values()].map((entry) => ({
      socketId: entry.participant.socketId,
      sharing: entry.sharing,
      lost: entry.lost,
    }));
  }

  // Two people can press Share inside one presence round trip; the one the room will not show
  // has to stop, or it keeps capturing and sending a screen nobody can see.
  function yieldStage(): void {
    if (lostContest(claimants(), socket?.id ?? '', screenStream?.id ?? null)) stopShare();
  }

  // A track can arrive before the presence message naming it, so every inbound stream is kept and
  // re-sorted whenever the claim changes. Nothing is guessed from track order.
  function sortStreams(entry: PeerEntry): void {
    const claimed = entry.inboundStreams.find((stream) => stream.id === entry.sharing) ?? null;

    entry.screenStream = claimed;
    entry.stream = entry.inboundStreams.find((stream) => stream !== claimed) ?? null;
  }

  function presence(): MeshMessage {
    return {
      type: 'presence',
      micOn: tracksEnabled('audio'),
      cameraOn: tracksEnabled('video'),
      sharing: screenStream?.id ?? null,
    };
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
      entry.sharing = message.sharing ?? null;
      sortStreams(entry);
      yieldStage();
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

  async function startShare(): Promise<void> {
    if (screenStream !== null) return;

    let display: MediaStream;
    try {
      display = await getDisplay();
    } catch {
      // Dismissing the picker is a decision, not a fault, and rejects the same way as a refusal.
      return;
    }

    const [track] = display.getVideoTracks();
    if (track === undefined) return;

    screenStream = display;
    track.addEventListener('ended', stopShare);
    for (const entry of peers.values()) entry.connection.addTrack(track, display);

    broadcast(presence());
    yieldStage();
    publish();
  }

  function stopShare(): void {
    if (screenStream === null) return;

    const tracks = screenStream.getTracks();
    screenStream = null;

    for (const entry of peers.values()) {
      for (const sender of entry.connection.getSenders()) {
        if (sender.track !== null && tracks.includes(sender.track)) {
          entry.connection.removeTrack(sender);
        }
      }
    }
    for (const track of tracks) track.stop();

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
    const polite = isPolite(socket?.id ?? '', participant.socketId);
    const entry: PeerEntry = {
      participant,
      connection,
      stream: null,
      screenStream: null,
      sharing: null,
      inboundStreams: [],
      connectionState: 'new',
      quality: null,
      sample: null,
      streak: 0,
      micOn: true,
      cameraOn: true,
      recovery: { attempts: 0, relayTried: false },
      recoveryTimer: null,
      lost: false,
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
        polite,
        initiator,
        send: (data) => socket?.emit('signal', { to: participant.socketId, data }),
        onTrack: (stream) => {
          if (!entry.inboundStreams.includes(stream)) entry.inboundStreams.push(stream);
          sortStreams(entry);
          publish();
        },
        onStateChange: (connectionState) => {
          entry.connectionState = connectionState;
          driveRecovery(entry, polite);
          publish();
        },
      }),
    };

    peers.set(participant.socketId, entry);
    startPolling();

    if (screenStream !== null) {
      for (const track of screenStream.getTracks()) connection.addTrack(track, screenStream);
    }

    if (localStream !== null) {
      for (const track of localStream.getTracks()) connection.addTrack(track, localStream);
    } else if (initiator) {
      connection.addTransceiver('video', { direction: 'recvonly' });
      connection.addTransceiver('audio', { direction: 'recvonly' });
    }

    publish();
  }

  function clearRecoveryTimer(entry: PeerEntry): void {
    if (entry.recoveryTimer === null) return;
    clearTimeout(entry.recoveryTimer);
    entry.recoveryTimer = null;
  }

  // Chrome fires no further connectionstatechange once a link is failed, so every rung after the
  // first has to be reached on a timer rather than an event.
  function armRecovery(entry: PeerEntry, polite: boolean, promote: boolean): void {
    if (entry.recoveryTimer !== null) return;

    entry.recoveryTimer = setTimeout(() => {
      entry.recoveryTimer = null;
      if (promote) {
        if (entry.connectionState !== 'disconnected') return;
        entry.connectionState = 'failed';
      } else if (entry.connectionState !== 'failed') {
        return;
      }
      driveRecovery(entry, polite);
      publish();
    }, GRACE_MS);
  }

  function driveRecovery(entry: PeerEntry, polite: boolean): void {
    const action = nextAction(entry.connectionState, entry.recovery, {
      canOffer: !polite,
      hasTurn: hasTurn(),
    });

    if (action !== 'wait') clearRecoveryTimer(entry);

    if (action === 'idle') {
      entry.recovery = { attempts: 0, relayTried: false };
      entry.lost = false;
      return;
    }

    if (action === 'restart') {
      entry.recovery = { ...entry.recovery, attempts: entry.recovery.attempts + 1 };
      entry.link.restart();
      armRecovery(entry, polite, false);
      return;
    }

    if (action === 'relay') {
      entry.recovery = { ...entry.recovery, relayTried: true };
      entry.link.relay();
      armRecovery(entry, polite, false);
      return;
    }

    if (action === 'lost') {
      entry.lost = true;
      return;
    }

    // Only a disconnect gets a grace timer; a polite peer's wait is passive and must not re-arm.
    if (entry.connectionState === 'disconnected') armRecovery(entry, polite, true);
  }

  function removePeer(socketId: string): void {
    const entry = peers.get(socketId);
    if (entry === undefined) return;

    clearRecoveryTimer(entry);
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

    // Stopped explicitly, or the browser goes on saying you are sharing after the call has ended.
    screenStream?.getTracks().forEach((track) => track.stop());
    screenStream = null;

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
    startShare,
    stopShare,
    sendChat,
    sendAttachment,
  };
}
