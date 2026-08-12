import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useWebRTC } from '../webrtc/useWebRTC';
import type { SessionStatus } from '../types';

// Bare media harness. VideoGrid and ParticipantTile replace all of it at step 6.

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  connected: 'In the room',
  'room-full': 'Room is full',
};

interface VideoBoxProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

function VideoBox({ stream, label, muted = false }: VideoBoxProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current !== null) video.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className="w-[22rem] max-w-full">
      <video
        ref={video}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video w-full border-[1.5px] border-ink object-cover"
      />
      <figcaption className="mt-1.5 font-mono text-[10px] tracking-[0.05em] uppercase">
        {label}
      </figcaption>
    </figure>
  );
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { status, localStream, participants, mediaError } = useWebRTC(roomId ?? '');

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8">
      <header className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-2">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          mesh-room <span className="font-sans font-normal opacity-55">/ </span>
          <span className="font-sans font-normal opacity-55">{roomId}</span>
        </h1>
        <p className="font-mono text-[10px] tracking-[0.05em] uppercase">
          {STATUS_LABEL[status]} · {participants.length + 1} of 6
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
        <div className="mt-8 flex flex-wrap gap-6">
          <VideoBox stream={localStream} label="You" muted />
          {participants.map((peer) => (
            <VideoBox
              key={peer.socketId}
              stream={peer.stream}
              label={`${peer.displayName} · ${peer.socketId.slice(0, 4)} · ${peer.connectionState}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
