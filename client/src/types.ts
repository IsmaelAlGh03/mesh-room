import type { MediaMode } from './webrtc/media';
import type { Bucket, LinkQuality } from './webrtc/quality';

export interface Participant {
  socketId: string;
  displayName: string;
}

export interface PeerParticipant extends Participant {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: LinkQuality | null;
  micOn: boolean;
  cameraOn: boolean;
  lost: boolean;
}

export interface PeerStat {
  peerId: string;
  bucket: Bucket;
  rtt: number | null;
  loss: number | null;
  relayed: boolean;
}

export type MeshMessage =
  | { type: 'chat'; id: string; text: string; at: number }
  | { type: 'presence'; micOn: boolean; cameraOn: boolean }
  | { type: 'stats'; at: number; links: PeerStat[] }
  | { type: 'file-meta'; id: string; name: string; mime: string; size: number; chunks: number; at: number }
  | { type: 'file-chunk'; id: string; index: number; data: string }
  | { type: 'file-end'; id: string };

export interface MessageAttachment {
  name: string;
  mime: string;
  url: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: number;
  mine: boolean;
  attachment?: MessageAttachment;
}

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'room-full' | 'left';

export interface SessionState {
  status: SessionStatus;
  localStream: MediaStream | null;
  participants: PeerParticipant[];
  messages: ChatMessage[];
  remoteStats: Record<string, PeerStat[]>;
  attachmentError: string | null;
  mediaError: string | null;
  mediaMode: MediaMode;
  micOn: boolean;
  cameraOn: boolean;
  connectedAt: number | null;
}

export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export interface SignalMessage {
  from: string;
  data: SignalData;
}
