import { useEffect, useRef, useState } from 'react';
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

const CAPTION_HEIGHT = 54;
const MIN_MEDIA_HEIGHT = 96;

function tileState(connectionState: RTCPeerConnectionState): TileState {
  if (connectionState === 'connected') return 'connected';
  if (connectionState === 'disconnected' || connectionState === 'failed') return 'reconnecting';
  return 'connecting';
}

// Tiles are 16:9 and sized by width, so fitting the height means capping the grid's width.
function fitWidth(box: HTMLElement, columns: number, count: number): number | null {
  // Below sm the column class collapses, so the row maths would not describe what renders.
  if (window.innerWidth < 640) return null;

  const rows = Math.ceil(count / columns);
  const gap = 24;
  const perRow = (box.clientHeight - gap * (rows - 1)) / rows;
  const media = Math.max(perRow - CAPTION_HEIGHT, MIN_MEDIA_HEIGHT);
  const width = (media * 16) / 9 * columns + gap * (columns - 1);

  return width < box.clientWidth ? Math.round(width) : null;
}

export function VideoGrid({
  localStream,
  participants,
  micOn = true,
  cameraOn = true,
}: VideoGridProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);

  const headcount = participants.length + 1;
  const columns = COLUMNS[Math.min(headcount, 6)] ?? 3;

  useEffect(() => {
    const element = box.current;
    if (element === null) return;

    const measure = (): void => setMaxWidth(fitWidth(element, columns, headcount));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns, headcount]);

  return (
    <div ref={box} className="flex h-full min-h-0 items-center justify-center">
      <div
        data-columns={columns}
        style={maxWidth === null ? undefined : { maxWidth }}
        className={`grid w-full gap-4 sm:gap-gutter ${COLUMN_CLASS[columns] ?? COLUMN_CLASS[3]}`}
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
            micOn={peer.micOn}
            cameraOn={peer.cameraOn}
            relayed={peer.quality?.relayed ?? false}
            degraded={peer.quality?.bucket === 'poor'}
            fields={peer.quality === null ? undefined : formatFields(peer.quality)}
            health={peer.quality === null ? null : healthFor(peer.quality.bucket)}
          />
        ))}
      </div>
    </div>
  );
}
