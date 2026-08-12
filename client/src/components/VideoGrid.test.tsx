import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoGrid } from './VideoGrid';
import type { PeerParticipant } from '../types';

function peers(count: number): PeerParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    socketId: `peer-${index}`,
    displayName: `Peer ${index}`,
    stream: null,
    connectionState: 'connected' as RTCPeerConnectionState,
    quality: null,
  }));
}

function columnsFor(participantCount: number): string | null {
  const { container, unmount } = render(
    <VideoGrid localStream={null} participants={peers(participantCount - 1)} />,
  );
  const columns = container.querySelector('[data-columns]')?.getAttribute('data-columns') ?? null;
  unmount();
  return columns;
}

describe('VideoGrid', () => {
  it('takes its column count from the headcount, not the window', () => {
    expect(columnsFor(1)).toBe('1');
    expect(columnsFor(2)).toBe('2');
    expect(columnsFor(3)).toBe('3');
    expect(columnsFor(4)).toBe('2');
    expect(columnsFor(5)).toBe('3');
    expect(columnsFor(6)).toBe('3');
  });

  it('puts you first and everyone else after', () => {
    render(<VideoGrid localStream={null} participants={peers(2)} />);

    const names = screen.getAllByRole('figure').map((tile) => tile.textContent ?? '');
    expect(names[0]).toContain('You');
    expect(names[1]).toContain('Peer 0');
    expect(names[2]).toContain('Peer 1');
  });
});
