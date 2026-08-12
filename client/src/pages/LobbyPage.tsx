import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MeshMark } from '../components/MeshMark';
import { createRoomId, parseRoomId } from '../lib/room-id';

const BAD_LINK = 'That is not a room link. Paste the whole link, or the room name on its own.';

export function LobbyPage(): JSX.Element {
  const navigate = useNavigate();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  function joinPastedRoom(event: FormEvent) {
    event.preventDefault();
    const roomId = parseRoomId(link);

    if (roomId === null) {
      setError(BAD_LINK);
      return;
    }

    navigate(`/room/${roomId}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-14">
      <div className="grid items-center gap-12 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase">
            Peer to peer · No account · Up to six
          </p>

          <h1
            aria-label="mesh-room"
            className="mt-5 font-display text-[clamp(3.25rem,11vw,5.5rem)] leading-[0.94] font-extrabold tracking-tight"
          >
            <span className="block">mesh</span>
            <span className="block">room</span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed">
            Video rooms that connect people directly to each other. Nothing is recorded,
            nothing is stored, and the room stops existing when the last person leaves.
          </p>

          <div className="mt-8 flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => navigate(`/room/${createRoomId()}`)}
              className="bg-ink px-6 py-3 text-sm font-bold text-substrate"
            >
              Start a room
            </button>

            <form onSubmit={joinPastedRoom} className="flex flex-wrap items-start gap-3">
              <div>
                <label htmlFor="room-link" className="sr-only">
                  Room link
                </label>
                <input
                  id="room-link"
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setError(null);
                  }}
                  placeholder="paste a room link"
                  aria-invalid={error !== null}
                  aria-describedby={error === null ? undefined : 'room-link-error'}
                  className="w-[16rem] border-[1.5px] border-ink bg-transparent px-4 py-3 font-mono text-[13px] placeholder:opacity-55"
                />
              </div>
              <button
                type="submit"
                className="border-[1.5px] border-ink px-6 py-3 text-sm font-bold"
              >
                Join
              </button>
            </form>
          </div>

          {error !== null && (
            <p id="room-link-error" role="alert" className="mt-4 font-mono text-[11px] text-alert">
              {error}
            </p>
          )}

          <p className="mt-10 border-t-[1.5px] border-ink pt-4 font-mono text-[10px] leading-[1.8] tracking-[0.03em] uppercase">
            Your video and messages travel between browsers, never through our server.
            <br />
            The server only introduces people to each other.
          </p>
        </div>

        <div className="order-first flex justify-center md:order-none">
          <MeshMark />
        </div>
      </div>
    </main>
  );
}
