import { useNavigate, useParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ControlBar } from '../components/ControlBar';
import { PreJoin } from '../components/PreJoin';
import { VideoGrid } from '../components/VideoGrid';
import { useRoomCount } from '../webrtc/useRoomCount';
import { useWebRTC } from '../webrtc/useWebRTC';
import type { SessionStatus } from '../types';

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Not in the room yet',
  connecting: 'Connecting…',
  connected: 'In the room',
  'room-full': 'Room is full',
  left: 'Left',
};

export function RoomPage(): JSX.Element {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const room = useWebRTC(roomId ?? '');
  const { status, localStream, participants, mediaError } = room;
  const occupancy = useRoomCount(roomId ?? '', status === 'idle');

  const inRoom = status === 'connecting' || status === 'connected';
  const showsCount = inRoom;

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col px-6 py-8">
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
          {showsCount && ` · ${participants.length + 1} of 6`}
        </p>
      </header>

      {mediaError !== null && inRoom && (
        <p role="alert" className="mt-6 font-mono text-[11px] text-alert">
          {mediaError}
        </p>
      )}

      {status === 'idle' && (
        <PreJoin
          roomId={roomId ?? ''}
          count={occupancy.count}
          capacity={occupancy.capacity}
          onJoin={room.join}
        />
      )}

      {status === 'room-full' && (
        <p className="mt-8 max-w-[46ch] text-[15px]">
          This room already has six people in it. Ask someone to leave, or start a room of your
          own.
        </p>
      )}

      {status === 'left' && (
        <div className="mt-8">
          <p className="max-w-[46ch] text-[15px]">
            You left the room. Nobody in it can see or hear you, and nothing was kept.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={room.reset}
              className="bg-ink px-6 py-3 text-sm font-bold text-substrate transition-colors duration-150 hover:bg-ink/90"
            >
              Rejoin
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="border-[1.5px] border-ink px-6 py-3 text-sm font-bold transition-colors duration-150 hover:bg-ink/10"
            >
              Back to the lobby
            </button>
          </div>
        </div>
      )}

      {showsCount && (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-8">
            <VideoGrid
              localStream={localStream}
              participants={participants}
              micOn={room.micOn}
              cameraOn={room.cameraOn}
            />
          </div>
          <ControlBar
            micOn={room.micOn}
            cameraOn={room.cameraOn}
            connectedAt={room.connectedAt}
            onToggleMic={room.toggleMic}
            onToggleCamera={room.toggleCamera}
            onLeave={room.leave}
          />
          <ChatPanel
            messages={room.messages}
            onSend={room.sendChat}
            onAttach={room.sendAttachment}
            attachmentError={room.attachmentError}
          />
        </>
      )}
    </main>
  );
}
