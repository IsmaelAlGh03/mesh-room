import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoGrid } from './VideoGrid';
import type { MeshLink } from '../webrtc/mesh-links';
import type { PeerParticipant } from '../types';

function peers(count: number): PeerParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    socketId: `peer-${index}`,
    displayName: `Peer ${index}`,
    stream: null,
    connectionState: 'connected' as RTCPeerConnectionState,
    quality: null,
    micOn: true,
    cameraOn: true,
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

  it('hands each tile the mic and camera state that peer announced', () => {
    const sending = {
      getVideoTracks: () => [{ kind: 'video', getSettings: () => ({ width: 640, height: 480 }) }],
      getAudioTracks: () => [{ kind: 'audio', enabled: true }],
    } as unknown as MediaStream;

    const [first, second] = peers(2);
    const participants = [
      { ...first, stream: sending, micOn: false, cameraOn: false },
      { ...second, stream: sending },
    ] as PeerParticipant[];

    const { container } = render(<VideoGrid localStream={null} participants={participants} />);

    // The peer still transmitting keeps its video; the one who announced off must not.
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByText('Mic off')).toBeInTheDocument();
  });

  it('forwards the links and the dimming to the layer that draws them', () => {
    const links: MeshLink[] = [
      {
        a: 'local',
        b: 'peer-0',
        bucket: 'poor',
        rtt: 340,
        loss: 0.04,
        relayed: false,
        firstHand: true,
      },
    ];

    const { container } = render(
      <VideoGrid localStream={null} participants={peers(1)} links={links} showLinks />,
    );

    expect(container.querySelector('svg[data-overlay="links"] path[data-link]')).toBeInTheDocument();
    expect(container.querySelector('[data-dimmed="true"]')).toBeInTheDocument();
  });

  it('draws nothing over the grid in call view', () => {
    const { container } = render(
      <VideoGrid localStream={null} participants={peers(1)} links={[]} showLinks={false} />,
    );

    expect(container.querySelector('svg[data-overlay="links"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-dimmed="true"]')).not.toBeInTheDocument();
  });
});
