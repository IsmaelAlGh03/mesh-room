import type { SignalData } from '../types';

export interface PeerLinkOptions {
  connection: RTCPeerConnection;
  polite: boolean;
  initiator: boolean;
  send(data: SignalData): void;
  onTrack(stream: MediaStream): void;
  onStateChange(state: RTCPeerConnectionState): void;
}

export interface PeerLink {
  accept(data: SignalData): Promise<void>;
  close(): void;
}

export function isPolite(localId: string, remoteId: string): boolean {
  return localId > remoteId;
}

export function createPeerLink(options: PeerLinkOptions): PeerLink {
  const { connection, polite, initiator, send, onTrack, onStateChange } = options;

  let makingOffer = false;
  let ignoreOffer = false;
  let mayOffer = initiator;

  function sendLocalDescription(): void {
    const description = connection.localDescription;
    if (description === null) return;
    send({ description: { type: description.type, sdp: description.sdp } });
  }

  connection.addEventListener('negotiationneeded', async () => {
    if (!mayOffer) return;
    try {
      makingOffer = true;
      await connection.setLocalDescription();
      sendLocalDescription();
    } finally {
      makingOffer = false;
    }
  });

  connection.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate !== null) send({ candidate: candidate.toJSON() });
  });

  connection.addEventListener('track', ({ streams }) => {
    const [stream] = streams;
    if (stream !== undefined) onTrack(stream);
  });

  connection.addEventListener('connectionstatechange', () => {
    onStateChange(connection.connectionState);
  });

  async function accept(data: SignalData): Promise<void> {
    if ('description' in data) {
      const { description } = data;
      const collision =
        description.type === 'offer' && (makingOffer || connection.signalingState !== 'stable');

      ignoreOffer = !polite && collision;
      if (ignoreOffer) return;

      await connection.setRemoteDescription(description);
      if (description.type === 'offer') {
        await connection.setLocalDescription();
        sendLocalDescription();
      }
      mayOffer = true;
      return;
    }

    try {
      await connection.addIceCandidate(data.candidate);
    } catch (error) {
      if (!ignoreOffer) throw error;
    }
  }

  return {
    accept,
    close: () => connection.close(),
  };
}
