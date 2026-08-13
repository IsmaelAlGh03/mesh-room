import { useEffect, useRef } from 'react';
import { MeshNode } from './MeshNode';

export type TileState = 'connecting' | 'connected' | 'reconnecting';

interface ParticipantTileProps {
  displayName: string;
  stream: MediaStream | null;
  state: TileState;
  isLocal?: boolean;
  micOn?: boolean;
  cameraOn?: boolean;
  relayed?: boolean;
  degraded?: boolean;
  fields?: string[];
  health?: number | null;
}

const FIELD_WIDTHS = ['6.5ch', '6ch', '6ch', '6ch'];

const REMOTE_STATUS: Record<TileState, string | null> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  connected: null,
};

function videoSettings(stream: MediaStream | null): MediaTrackSettings | null {
  const track = stream?.getVideoTracks()[0];
  if (track === undefined || track.enabled === false) return null;
  return track.getSettings();
}

function hasCamera(stream: MediaStream | null): boolean {
  return (stream?.getVideoTracks().length ?? 0) > 0;
}

export function ParticipantTile({
  displayName,
  stream,
  state,
  isLocal = false,
  micOn = true,
  cameraOn = true,
  relayed = false,
  degraded: isDegraded = false,
  fields,
  health = null,
}: ParticipantTileProps): JSX.Element {
  const video = useRef<HTMLVideoElement>(null);
  const settings = videoSettings(stream);
  const hasVideo = settings !== null && (!isLocal || cameraOn);

  // hasVideo remounts the element, and the stream identity never changes, so it has to be a dep.
  useEffect(() => {
    if (video.current !== null) video.current.srcObject = stream;
  }, [stream, hasVideo]);

  const statusWord = isLocal
    ? hasVideo
      ? null
      : hasCamera(stream)
        ? 'Camera off'
        : 'No camera'
    : (REMOTE_STATUS[state] ?? (hasVideo ? null : 'Camera off'));

  const localFields = hasVideo
    ? ['Local', `${settings?.width ?? 0}×${settings?.height ?? 0}`, `${Math.round(settings?.frameRate ?? 0)}fps`]
    : ['Local', hasCamera(stream) ? 'camera off' : 'audio only'];

  if (isLocal && !micOn) localFields.push('Mic off');

  const readout = isLocal ? localFields : (fields ?? [REMOTE_STATUS[state] ?? 'Connected']);
  const degraded = relayed || isDegraded || state === 'reconnecting';

  return (
    <figure className="m-0 flex flex-col">
      <div
        className={`relative aspect-video border-[1.5px] ${degraded ? 'border-alert' : 'border-ink'}`}
      >
        {hasVideo ? (
          <video
            ref={video}
            aria-label={isLocal ? 'Your camera' : `${displayName}'s camera`}
            autoPlay
            playsInline
            muted={isLocal}
            className={`mesh-fade h-full w-full object-cover ${isLocal ? '-scale-x-100' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <MeshNode ringed={isLocal} className="h-4 w-4" />
            <span className="font-mono text-[11px] tracking-[0.06em] uppercase opacity-75">
              {statusWord}
            </span>
          </div>
        )}

        {isLocal && (
          <span className="absolute bottom-0 left-0 bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-substrate uppercase">
            You
          </span>
        )}
        {relayed && (
          <span className="absolute bottom-0 left-0 bg-alert px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-substrate uppercase">
            Relayed
          </span>
        )}
      </div>

      <figcaption className="mt-2 min-h-[2.75rem]">
        <span className="flex items-center gap-2">
          <MeshNode ringed={isLocal} className={`h-3 w-3 ${degraded ? 'text-alert' : ''}`} />
          <span
            className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]"
            title={displayName}
          >
            {displayName}
          </span>
        </span>
        <span
          className={`mt-1 grid grid-flow-col justify-start gap-x-3 font-mono text-[11px] tracking-[0.04em] tabular-nums uppercase ${
            degraded ? 'text-alert' : 'opacity-65'
          }`}
        >
          {readout.map((field, index) => (
            <span key={field} style={{ minWidth: FIELD_WIDTHS[index] }}>
              {field}
            </span>
          ))}
        </span>
      </figcaption>

      {health !== null && (
        <span
          aria-hidden="true"
          className={`mt-1 block h-0.5 ${degraded ? 'bg-alert' : 'bg-ink'}`}
          style={{ width: `${Math.round(health * 100)}%` }}
        />
      )}
    </figure>
  );
}
