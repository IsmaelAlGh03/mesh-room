import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ControlBar } from '../components/ControlBar';
import { CopyLink } from '../components/CopyLink';
import { PreJoin } from '../components/PreJoin';
import { VideoGrid } from '../components/VideoGrid';
import { saveTranscript } from '../lib/save-transcript';
import { Stage } from '../components/Stage';
import { buildLinks, LOCAL_ID } from '../webrtc/mesh-links';
import { stageHolder } from '../webrtc/stage';
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
  const [linksView, setLinksView] = useState(false);
  const links = useMemo(
    () => buildLinks(participants, room.remoteStats),
    [participants, room.remoteStats],
  );

  const holder = stageHolder(participants, room.localId, room.sharing);
  const held = participants.find((peer) => peer.socketId === holder) ?? null;
  const stage =
    holder === null
      ? null
      : holder === LOCAL_ID
        ? { holder, stream: room.screenStream, name: 'You' }
        : { holder, stream: held?.screenStream ?? null, name: held?.displayName ?? 'A peer' };

  const inRoom = status === 'connecting' || status === 'connected';
  const showsCount = inRoom;

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col px-6 py-8">
      <header className="flex flex-col gap-1 border-b-[1.5px] border-ink pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-x-2">
          <h1 className="min-w-0 truncate font-display text-xl font-extrabold tracking-tight">
            mesh-room <span className="font-sans font-normal opacity-55">/ </span>
            <span translate="no" className="font-sans font-normal opacity-55">
              {roomId}
            </span>
          </h1>
          <CopyLink url={window.location.href} />
        </div>
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
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-8">
            {stage !== null && (
              <Stage
                stream={stage.stream}
                sharerName={stage.name}
                isLocal={stage.holder === LOCAL_ID}
              />
            )}
            <VideoGrid
              localStream={localStream}
              participants={participants}
              micOn={room.micOn}
              cameraOn={room.cameraOn}
              links={links}
              showLinks={linksView}
              strip={stage !== null}
            />
          </div>
          <ControlBar
            micOn={room.micOn}
            cameraOn={room.cameraOn}
            connectedAt={room.connectedAt}
            exportable={room.messages.length > 0}
            linksView={linksView}
            sharing={room.sharing !== null}
            sharedBy={stage === null || stage.holder === LOCAL_ID ? null : stage.name}
            onToggleMic={room.toggleMic}
            onToggleCamera={room.toggleCamera}
            onToggleLinks={() => setLinksView((open) => !open)}
            onToggleShare={() => void (room.sharing === null ? room.startShare() : room.stopShare())}
            onExport={() => saveTranscript(room.messages, roomId ?? '')}
            onLeave={room.leave}
          />
          <ChatPanel
            messages={room.messages}
            onSend={room.sendChat}
            onAttach={room.sendAttachment}
            attachmentError={room.attachmentError}
            compact={stage !== null}
          />
        </>
      )}
    </main>
  );
}
