import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlBar } from './ControlBar';

function renderBar(overrides: Partial<Parameters<typeof ControlBar>[0]> = {}) {
  const props = {
    micOn: true,
    cameraOn: true,
    connectedAt: null,
    onToggleMic: vi.fn(),
    onToggleCamera: vi.fn(),
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
});
