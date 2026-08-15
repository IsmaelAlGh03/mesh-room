import { useEffect, useRef, useState } from 'react';
import { CopyIcon } from './icons';

interface CopyLinkProps {
  url: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

const SETTLE_MS = 2000;

export function CopyLink({ url }: CopyLinkProps): JSX.Element {
  const [state, setState] = useState<CopyState>('idle');
  const settle = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(settle.current), []);

  async function copy(): Promise<void> {
    clearTimeout(settle.current);

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      settle.current = setTimeout(() => setState('idle'), SETTLE_MS);
    } catch {
      setState('failed');
    }
  }

  return (
    <span className="flex shrink-0 flex-col items-start gap-0.5">
      <button
        type="button"
        aria-label="Copy link"
        title="Copy the link to this room"
        onClick={() => void copy()}
        className="p-1 opacity-55 transition-opacity duration-150 hover:opacity-100"
      >
        <CopyIcon copied={state === 'copied'} />
      </button>

      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Link copied' : ''}
      </span>

      {state === 'failed' && (
        <p role="alert" className="max-w-[15rem] font-mono text-[11px] leading-snug text-alert">
          Copying was blocked. Copy the link from your address bar.
        </p>
      )}
    </span>
  );
}
