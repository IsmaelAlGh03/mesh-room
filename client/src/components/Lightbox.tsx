import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { MessageAttachment } from '../types';

interface LightboxProps {
  attachment: MessageAttachment;
  onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Lightbox({ attachment, onClose }: LightboxProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  // Whatever had focus when this opened gets it back when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function trap(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return;

    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (element) => element.tabIndex >= 0,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      onKeyDown={trap}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/85 p-6"
    >
      {/* Escape and Close carry this for the keyboard; the backdrop is mouse convenience only. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" />

      <img
        src={attachment.url}
        alt={attachment.name}
        className="relative max-h-[85vh] max-w-[90vw] border-[1.5px] border-substrate object-contain"
      />

      <div className="relative flex items-center gap-4">
        <p className="font-mono text-[11px] tracking-[0.04em] text-substrate">
          {attachment.name}
        </p>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          className="bg-substrate px-5 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-substrate/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
