import type { LinkQuality } from './webrtc/quality';

export interface Participant {
  socketId: string;
  displayName: string;
}

export interface PeerParticipant extends Participant {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: LinkQuality | null;
}

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'room-full' | 'left';

export interface SessionState {
  status: SessionStatus;
  localStream: MediaStream | null;
  participants: PeerParticipant[];
  mediaError: string | null;
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
