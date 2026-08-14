import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Lightbox } from './Lightbox';
import { AttachIcon } from './icons';
import { describeAttachment } from '../webrtc/chunker';
import type { ChatMessage, MessageAttachment } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onAttach: (file: File) => void;
  attachmentError?: string | null;
}

const CAVEAT = 'You only have messages from after you joined. Nothing is kept.';
const NEAR_BOTTOM_PX = 24;

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({
  messages,
  onSend,
  onAttach,
  attachmentError = null,
}: ChatPanelProps): JSX.Element {
  const log = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pinned = useRef(true);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const [viewing, setViewing] = useState<MessageAttachment | null>(null);

  useEffect(() => {
    const element = log.current;
    if (element === null) return;

    if (pinned.current) {
      element.scrollTop = element.scrollHeight;
      setUnread(0);
    } else {
      setUnread((count) => count + 1);
    }
  }, [messages]);

  function trackScroll(): void {
    const element = log.current;
    if (element === null) return;

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = distance <= NEAR_BOTTOM_PX;
    if (pinned.current) setUnread(0);
  }

  function jumpToLatest(): void {
    const element = log.current;
    if (element === null) return;

    pinned.current = true;
    element.scrollTop = element.scrollHeight;
    setUnread(0);
  }

  function pick(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change.
    event.target.value = '';
    if (file !== undefined) onAttach(file);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (draft.trim() === '') return;

    onSend(draft);
    setDraft('');
    pinned.current = true;
  }

  return (
    <section
      aria-label="Messages"
      className="mt-8 flex flex-col border-t-[1.5px] border-ink pt-4"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[10px] tracking-[0.1em] uppercase opacity-60">Messages</h2>
        <p className="font-mono text-[10px] tracking-[0.03em] uppercase opacity-50">{CAVEAT}</p>
      </div>

      <div className="relative">
        <div
          ref={log}
          onScroll={trackScroll}
          aria-live="polite"
          className="mt-3 h-[6.5rem] overflow-y-auto"
        >
          {messages.map((message) => (
            <p key={message.id} className="mb-2 grid grid-cols-[7rem_3.5rem_1fr] gap-3">
              <span className="truncate text-[14px] font-medium" title={message.authorName}>
                {message.authorName}
              </span>
              <span className="font-mono text-[11px] tabular-nums opacity-55">
                {formatTime(message.at)}
              </span>
              {message.attachment === undefined ? (
                <span className="text-[15px] leading-snug">{message.text}</span>
              ) : (
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setViewing(message.attachment ?? null)}
                    className="border-[1.5px] border-ink"
                  >
                    <img
                      src={message.attachment.url}
                      alt={message.attachment.name}
                      className="block h-10 w-16 object-cover"
                    />
                  </button>
                  <span className="font-mono text-[11px] tracking-[0.04em] opacity-65">
                    {describeAttachment({
                      name: message.attachment.name,
                      size: message.attachment.size,
                    })}
                  </span>
                </span>
              )}
            </p>
          ))}
        </div>

        {unread > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute right-0 bottom-0 border-[1.5px] border-ink bg-substrate px-2 py-1 font-mono text-[10px] tracking-[0.06em] uppercase"
          >
            {unread} new below
          </button>
        )}
      </div>

      {attachmentError !== null && (
        <p role="alert" className="mt-3 font-mono text-[11px] text-alert">
          {attachmentError}
        </p>
      )}

      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Message"
          placeholder="Type a message…"
          className="min-w-0 flex-1 border-[1.5px] border-ink bg-transparent px-3 py-2.5 text-[14px] placeholder:opacity-45"
        />
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={pick}
          className="hidden"
        />
        <button
          type="button"
          aria-label="Attach"
          onClick={() => picker.current?.click()}
          className="flex items-center border-[1.5px] border-ink px-3 py-2.5 transition-colors duration-150 hover:bg-ink/10"
        >
          <AttachIcon />
        </button>
        <button
          type="submit"
          className="bg-ink px-5 py-2.5 text-sm font-bold text-substrate transition-colors duration-150 hover:bg-ink/90"
        >
          Send
        </button>
      </form>

      {viewing !== null && <Lightbox attachment={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
