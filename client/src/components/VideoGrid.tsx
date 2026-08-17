import { useEffect, useRef, useState } from 'react';
import { ConnectionOverlay } from './ConnectionOverlay';
import { ParticipantTile, type TileState } from './ParticipantTile';
import { ringNodes, type NodePoint } from '../lib/mesh-layout';
import { formatFields, healthFor } from '../webrtc/quality';
import { LOCAL_ID, type MeshLink } from '../webrtc/mesh-links';
import type { PeerParticipant } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  participants: PeerParticipant[];
  micOn?: boolean;
  cameraOn?: boolean;
  links?: MeshLink[];
  showLinks?: boolean;
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
  const width = ((media * 16) / 9) * columns + gap * (columns - 1);

  return width < box.clientWidth ? Math.round(width) : null;
}

export function VideoGrid({
  localStream,
  participants,
  micOn = true,
  cameraOn = true,
  links = [],
  showLinks = false,
}: VideoGridProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const [nodes, setNodes] = useState<NodePoint[]>([]);
  const [frame, setFrame] = useState({ width: 0, height: 0, ring: false });

  const headcount = participants.length + 1;
  const columns = COLUMNS[Math.min(headcount, 6)] ?? 3;
  const ids = [LOCAL_ID, ...participants.map((participant) => participant.socketId)];
  const idKey = ids.join(',');

  useEffect(() => {
    const element = box.current;
    if (element === null) return;

    const measure = (): void => {
      setMaxWidth(fitWidth(element, columns, headcount));

      const container = grid.current;
      if (container === null) return;

      const members = idKey.split(',');
      const origin = container.getBoundingClientRect();

      // Below sm the column is taller than the screen, so the ring pins to the scrolling box.
      if (window.innerWidth < 640) {
        const band = element.parentElement?.getBoundingClientRect() ?? origin;
        setFrame({ width: band.width, height: band.height, ring: true });
        setNodes(ringNodes(members, { width: band.width, height: band.height }));
        return;
      }

      setFrame({ width: origin.width, height: origin.height, ring: false });
      setNodes(
        Array.from(container.children).flatMap((child, index) => {
          const media = child.firstElementChild?.getBoundingClientRect();
          const id = members[index];
          if (media === undefined || id === undefined) return [];

          return [
            {
              id,
              x: media.left - origin.left + media.width / 2,
              y: media.top - origin.top + media.height / 2,
            },
          ];
        }),
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns, headcount, idKey, showLinks]);

  const overlay = (
    <ConnectionOverlay
      nodes={nodes}
      links={links}
      names={{
        [LOCAL_ID]: 'You',
        ...Object.fromEntries(
          participants.map((participant) => [participant.socketId, participant.displayName]),
        ),
      }}
      width={frame.width}
      height={frame.height}
      labelled={frame.ring}
    />
  );

  return (
    <div ref={box} className="flex h-full min-h-0 items-center justify-center">
      {/* The overlay is inset to this box, so it has to be the grid's box exactly, not wider. */}
      <div
        className="relative mx-auto w-full"
        style={maxWidth === null ? undefined : { maxWidth }}
      >
        {showLinks && frame.ring && (
          <div className="pointer-events-none sticky top-0 z-10 h-0">
            <div className="relative" style={{ height: frame.height }}>
              {overlay}
            </div>
          </div>
        )}

        <div
          ref={grid}
          data-columns={columns}
          className={`grid w-full gap-4 sm:gap-gutter ${COLUMN_CLASS[columns] ?? COLUMN_CLASS[3]}`}
        >
          <ParticipantTile
            displayName="You"
            stream={localStream}
            state="connected"
            isLocal
            micOn={micOn}
            cameraOn={cameraOn}
            dimmed={showLinks}
          />
          {participants.map((peer) => (
            <ParticipantTile
              key={peer.socketId}
              displayName={peer.displayName}
              stream={peer.stream}
              state={tileState(peer.connectionState)}
              micOn={peer.micOn}
              cameraOn={peer.cameraOn}
              dimmed={showLinks}
              relayed={peer.quality?.relayed ?? false}
              degraded={peer.quality?.bucket === 'poor'}
              lost={peer.lost}
              fields={peer.quality === null ? undefined : formatFields(peer.quality)}
              health={peer.quality === null ? null : healthFor(peer.quality.bucket)}
            />
          ))}
        </div>

        {showLinks && !frame.ring && (
          <div className="pointer-events-none absolute inset-0">{overlay}</div>
        )}
      </div>
    </div>
  );
}
