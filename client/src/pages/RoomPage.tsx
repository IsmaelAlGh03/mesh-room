import { useParams } from 'react-router-dom';
import { VideoGrid } from '../components/VideoGrid';
import { useWebRTC } from '../webrtc/useWebRTC';
import type { SessionStatus } from '../types';

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'In the room',
  'room-full': 'Room is full',
};

export function RoomPage(): JSX.Element {
  const { roomId } = useParams<{ roomId: string }>();
  const { status, localStream, participants, mediaError } = useWebRTC(roomId ?? '');

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8">
      <header className="flex flex-col gap-1 border-b-[1.5px] border-ink pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h1 className="min-w-0 truncate font-display text-xl font-extrabold tracking-tight">
          mesh-room <span className="font-sans font-normal opacity-55">/ </span>
          <span translate="no" className="font-sans font-normal opacity-55">
            {roomId}
          </span>
        </h1>
        <p
          aria-live="polite"
          className="shrink-0 font-mono text-[10px] tracking-[0.05em] whitespace-nowrap uppercase"
        >
          {STATUS_LABEL[status]}
          {status !== 'room-full' && ` · ${participants.length + 1} of 6`}
        </p>
      </header>

      {mediaError !== null && (
        <p role="alert" className="mt-6 font-mono text-[11px] text-alert">
          {mediaError}
        </p>
      )}

      {status === 'room-full' ? (
        <p className="mt-8 max-w-[46ch] text-[15px]">
          This room already has six people in it. Ask someone to leave, or start a room of your
          own.
        </p>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-8">
          <VideoGrid localStream={localStream} participants={participants} />
        </div>
      )}
    </main>
  );
}
