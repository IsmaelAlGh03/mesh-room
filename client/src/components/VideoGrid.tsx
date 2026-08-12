import { ParticipantTile, type TileState } from './ParticipantTile';
import { formatFields, healthFor } from '../webrtc/quality';
import type { PeerParticipant } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  participants: PeerParticipant[];
  micOn?: boolean;
  cameraOn?: boolean;
}

const COLUMNS = [1, 1, 2, 3, 2, 3, 3];

const COLUMN_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3',
};

function tileState(connectionState: RTCPeerConnectionState): TileState {
  if (connectionState === 'connected') return 'connected';
  if (connectionState === 'disconnected' || connectionState === 'failed') return 'reconnecting';
  return 'connecting';
}

export function VideoGrid({
  localStream,
  participants,
  micOn = true,
  cameraOn = true,
}: VideoGridProps): JSX.Element {
  const headcount = participants.length + 1;
  const columns = COLUMNS[Math.min(headcount, 6)] ?? 3;

  return (
    <div
      data-columns={columns}
      className={`grid gap-4 sm:gap-gutter ${COLUMN_CLASS[columns] ?? COLUMN_CLASS[3]}`}
    >
      <ParticipantTile
        displayName="You"
        stream={localStream}
        state="connected"
        isLocal
        micOn={micOn}
        cameraOn={cameraOn}
      />
      {participants.map((peer) => (
        <ParticipantTile
          key={peer.socketId}
          displayName={peer.displayName}
          stream={peer.stream}
          state={tileState(peer.connectionState)}
          relayed={peer.quality?.relayed ?? false}
          degraded={peer.quality?.bucket === 'poor'}
          fields={peer.quality === null ? undefined : formatFields(peer.quality)}
          health={peer.quality === null ? null : healthFor(peer.quality.bucket)}
        />
      ))}
    </div>
  );
}
