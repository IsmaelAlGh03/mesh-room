import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Lightbox } from './Lightbox';
import type { MessageAttachment } from '../types';

const attachment: MessageAttachment = {
  name: 'shot.png',
  mime: 'image/png',
  url: 'blob:mock-url',
  size: 2048,
};

function Harness(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open shot.png
      </button>
      {open && <Lightbox attachment={attachment} onClose={() => setOpen(false)} />}
    </>
  );
}

describe('Lightbox', () => {
  it('announces itself as a modal dialog named after the file', () => {
    render(<Lightbox attachment={attachment} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('shot.png');
  });

  it('shows the image at full size with the filename as its description', () => {
    render(<Lightbox attachment={attachment} onClose={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute('src', 'blob:mock-url');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Lightbox attachment={attachment} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the Close button is used', () => {
    const onClose = vi.fn();
    render(<Lightbox attachment={attachment} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes focus when it opens and hands it back to the trigger when it closes', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open shot.png' });

    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger).toHaveFocus();
  });

  it('keeps Tab inside the dialog', () => {
    render(<Lightbox attachment={attachment} onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close' });

    expect(close).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });

    expect(close).toHaveFocus();
  });
});
