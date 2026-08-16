import { useEffect, useState } from 'react';
import { DeviceIcon, ExportIcon, LeaveIcon, LinksIcon } from './icons';
import { formatDuration } from '../lib/duration';

interface ControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  connectedAt: number | null;
  exportable: boolean;
  linksView: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleLinks: () => void;
  onExport: () => Promise<void> | void;
  onLeave: () => void;
}

const TOGGLE_BASE =
  'flex items-center gap-2.5 border-[1.5px] px-5 py-3 text-sm font-medium transition-colors duration-150';

function toggleClass(on: boolean): string {
  return on
    ? `${TOGGLE_BASE} border-ink bg-transparent hover:bg-ink/10`
    : `${TOGGLE_BASE} border-ink bg-ink text-substrate hover:bg-ink/90`;
}

function actionClass(enabled: boolean): string {
  return enabled
    ? `${TOGGLE_BASE} border-ink bg-transparent hover:bg-ink/10`
    : `${TOGGLE_BASE} cursor-not-allowed border-ink/40 text-ink/40`;
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
  exportable,
  linksView,
  onToggleMic,
  onToggleCamera,
  onToggleLinks,
  onExport,
  onLeave,
}: ControlBarProps): JSX.Element {
  const elapsed = useElapsed(connectedAt);
  const [copying, setCopying] = useState(false);

  async function takeCopy(): Promise<void> {
    setCopying(true);
    try {
      await onExport();
    } finally {
      setCopying(false);
    }
  }

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

      <button
        type="button"
        aria-pressed={linksView}
        onClick={onToggleLinks}
        className={toggleClass(!linksView)}
      >
        <LinksIcon />
        Links
      </button>

      <button
        type="button"
        title="Take a copy before you leave"
        disabled={!exportable || copying}
        onClick={() => void takeCopy()}
        className={actionClass(exportable && !copying)}
      >
        <ExportIcon />
        {copying ? 'Taking a copy…' : 'Take a copy'}
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
