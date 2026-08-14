import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './ChatPanel';
import type { ChatMessage } from '../types';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    authorId: 'peer-1',
    authorName: 'Nadia',
    text: 'can you hear me now?',
    at: Date.UTC(2026, 7, 14, 12, 2),
    mine: false,
    ...overrides,
  };
}

describe('ChatPanel attachments', () => {
  const withImage = message({
    id: 'm9',
    text: '',
    attachment: { name: 'shot.png', mime: 'image/png', url: 'blob:mock', size: 2 * 1024 * 1024 },
  });

  it('shows an attachment as a thumbnail with its name and size in mono', () => {
    render(<ChatPanel messages={[withImage]} onSend={vi.fn()} onAttach={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute('src', 'blob:mock');
    expect(screen.getByText('shot.png · 2.0MB')).toBeInTheDocument();
  });

  it('opens the lightbox when the thumbnail is clicked', () => {
    render(<ChatPanel messages={[withImage]} onSend={vi.fn()} onAttach={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('img', { name: 'shot.png' }));

    expect(screen.getByRole('dialog')).toHaveAccessibleName('shot.png');
  });

  it('offers an attach control named in words even though it shows a glyph', () => {
    render(<ChatPanel messages={[]} onSend={vi.fn()} onAttach={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
  });

  it('hands the chosen file up, and clears the picker so the same file can be sent twice', () => {
    const onAttach = vi.fn();
    const { container } = render(<ChatPanel messages={[]} onSend={vi.fn()} onAttach={onAttach} />);
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['bytes'], 'shot.png', { type: 'image/png' });

    fireEvent.change(picker, { target: { files: [file] } });

    expect(onAttach).toHaveBeenCalledWith(file);
    expect(picker.value).toBe('');
  });

  it('reports a refused file in the alert treatment, because that is a fault', () => {
    render(
      <ChatPanel
        messages={[]}
        onSend={vi.fn()}
        onAttach={vi.fn()}
        attachmentError="That image is over 5MB. Send a smaller one."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('over 5MB');
  });
});

describe('ChatPanel', () => {
  it('lists messages with who sent them', () => {
    render(
      <ChatPanel
        messages={[message(), message({ id: 'm2', authorName: 'You', text: 'loud and clear', mine: true })]}
        onSend={vi.fn()}
        onAttach={vi.fn()}
      />,
    );

    expect(screen.getByText('Nadia')).toBeInTheDocument();
    expect(screen.getByText('can you hear me now?')).toBeInTheDocument();
    expect(screen.getByText('loud and clear')).toBeInTheDocument();
  });

  it('sends the draft and clears the field', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onAttach={vi.fn()} />);

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'ready when you are' } });
    fireEvent.submit(input);

    expect(onSend).toHaveBeenCalledWith('ready when you are');
    expect(input).toHaveValue('');
  });

  it('refuses to send an empty draft', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} onAttach={vi.fn()} />);

    fireEvent.submit(screen.getByLabelText('Message'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps the no-history caveat on screen with no way to dismiss it', () => {
    render(<ChatPanel messages={[message()]} onSend={vi.fn()} onAttach={vi.fn()} />);

    expect(
      screen.getByText('You only have messages from after you joined. Nothing is kept.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('offers a way back to the newest message only once scrolled away from it', () => {
    const { rerender, container } = render(<ChatPanel messages={[message()]} onSend={vi.fn()} onAttach={vi.fn()} />);
    const log = container.querySelector('[aria-live="polite"]') as HTMLElement;

    expect(screen.queryByRole('button', { name: /new below/i })).not.toBeInTheDocument();

    Object.defineProperty(log, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(log, 'clientHeight', { value: 100, configurable: true });
    log.scrollTop = 0;
    fireEvent.scroll(log);

    rerender(<ChatPanel messages={[message(), message({ id: 'm2', text: 'still here?' })]} onSend={vi.fn()} onAttach={vi.fn()} />);

    expect(screen.getByRole('button', { name: '1 new below' })).toBeInTheDocument();
  });
});
