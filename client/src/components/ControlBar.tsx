import { useEffect, useState } from 'react';
import { DeviceIcon, LeaveIcon } from './icons';
import { formatDuration } from '../lib/duration';

interface ControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  connectedAt: number | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
}

const TOGGLE_BASE =
  'flex items-center gap-2.5 border-[1.5px] border-ink px-5 py-3 text-sm font-medium transition-colors duration-150';

function toggleClass(on: boolean): string {
  return on
    ? `${TOGGLE_BASE} bg-transparent hover:bg-ink/10`
    : `${TOGGLE_BASE} bg-ink text-substrate hover:bg-ink/90`;
}

function useElapsed(connectedAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connectedAt === null) return;

    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [connectedAt]);

  return connectedAt === null ? null : formatDuration(now - connectedAt);
}

export function ControlBar({
  micOn,
  cameraOn,
  connectedAt,
  onToggleMic,
  onToggleCamera,
  onLeave,
}: ControlBarProps): JSX.Element {
  const elapsed = useElapsed(connectedAt);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t-[1.5px] border-ink pt-4">
      <button type="button" aria-pressed={micOn} onClick={onToggleMic} className={toggleClass(micOn)}>
        <DeviceIcon device="mic" on={micOn} />
        Mic {micOn ? 'on' : 'off'}
      </button>

      <button
        type="button"
        aria-pressed={cameraOn}
        onClick={onToggleCamera}
        className={toggleClass(cameraOn)}
      >
        <DeviceIcon device="camera" on={cameraOn} />
        Camera {cameraOn ? 'on' : 'off'}
      </button>

      {elapsed !== null && (
        <p className="font-mono text-[11px] tracking-[0.05em] tabular-nums uppercase opacity-70">
          Open {elapsed}
        </p>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="ml-auto flex items-center gap-2.5 bg-ink px-6 py-3 text-sm font-bold text-substrate transition-colors duration-150 hover:bg-ink/90"
      >
        <LeaveIcon />
        Leave
      </button>
    </div>
  );
}
