import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlBar } from './ControlBar';

function renderBar(overrides: Partial<Parameters<typeof ControlBar>[0]> = {}) {
  const props = {
    micOn: true,
    cameraOn: true,
    connectedAt: null,
    exportable: true,
    linksView: false,
    sharing: false,
    sharedBy: null,
    onToggleMic: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleLinks: vi.fn(),
    onToggleShare: vi.fn(),
    onExport: vi.fn(),
    onLeave: vi.fn(),
    ...overrides,
  };

  render(<ControlBar {...props} />);
  return props;
}

describe('ControlBar', () => {
  it('names the state it is in, and says so to screen readers', () => {
    renderBar();

    expect(screen.getByRole('button', { name: 'Mic on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Camera on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('flips both label and pressed state when something is off', () => {
    renderBar({ micOn: false, cameraOn: false });

    expect(screen.getByRole('button', { name: 'Mic off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Camera off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports each press to its own handler', async () => {
    const user = userEvent.setup();
    const props = renderBar();

    await user.click(screen.getByRole('button', { name: 'Mic on' }));
    await user.click(screen.getByRole('button', { name: 'Camera on' }));
    await user.click(screen.getByRole('button', { name: 'Leave' }));

    expect(props.onToggleMic).toHaveBeenCalledOnce();
    expect(props.onToggleCamera).toHaveBeenCalledOnce();
    expect(props.onLeave).toHaveBeenCalledOnce();
  });

  it('offers no copy until there is something to copy', () => {
    renderBar({ exportable: false });

    expect(screen.getByRole('button', { name: 'Take a copy' })).toBeDisabled();
  });

  it('hands the copy to its handler, and says so while it works', async () => {
    const user = userEvent.setup();
    let finish = (): void => {};
    const props = renderBar({
      exportable: true,
      onExport: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    });

    await user.click(screen.getByRole('button', { name: 'Take a copy' }));

    expect(props.onExport).toHaveBeenCalledOnce();
    const working = screen.getByRole('button', { name: 'Taking a copy…' });
    expect(working).toBeDisabled();

    finish();
    expect(await screen.findByRole('button', { name: 'Take a copy' })).toBeEnabled();
  });

  it('offers the links view and reports each press', async () => {
    const user = userEvent.setup();
    const props = renderBar({ linksView: false });

    const button = screen.getByRole('button', { name: 'Links' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(props.onToggleLinks).toHaveBeenCalledOnce();
  });

  it('marks the links button pressed while the view is open', () => {
    renderBar({ linksView: true });

    expect(screen.getByRole('button', { name: 'Links' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('spells out what the copy is for', () => {
    renderBar();

    expect(screen.getByRole('button', { name: 'Take a copy' })).toHaveAttribute(
      'title',
      'Take a copy before you leave',
    );
  });
});

describe('ControlBar timer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts from the moment the room connected', () => {
    renderBar({ connectedAt: Date.now() - 62_000 });

    expect(screen.getByText('Open 00:01:02')).toBeInTheDocument();
  });

  it('shows no clock before the room connects', () => {
    renderBar({ connectedAt: null });

    expect(screen.queryByText(/Open/)).not.toBeInTheDocument();
  });

  it('names the screen state it is in, like the other toggles', async () => {
    const props = renderBar({ sharing: false });
    const button = screen.getByRole('button', { name: 'Screen off' });

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(props.onToggleShare).toHaveBeenCalledOnce();
  });

  it('reads as on while you are the one sharing', () => {
    renderBar({ sharing: true });

    expect(screen.getByRole('button', { name: 'Screen on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('names whoever holds the screen and blocks the control while they do', async () => {
    const props = renderBar({ sharing: false, sharedBy: 'Bo' });
    const button = screen.getByRole('button', { name: 'Bo is sharing' });

    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(props.onToggleShare).not.toHaveBeenCalled();
  });
});
