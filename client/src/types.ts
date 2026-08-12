export interface Participant {
  socketId: string;
  displayName: string;
}

export interface PeerParticipant extends Participant {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
}

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'room-full';

export interface SessionState {
  status: SessionStatus;
  localStream: MediaStream | null;
  participants: PeerParticipant[];
  mediaError: string | null;
}

export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export interface SignalMessage {
  from: string;
  data: SignalData;
}
