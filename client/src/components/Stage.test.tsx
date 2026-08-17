import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stage } from './Stage';

function fakeStream(): MediaStream {
  const track = { kind: 'video', enabled: true, stop: vi.fn() };
  return {
    id: 'screen-1',
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe('Stage', () => {
  it('says whose screen it is showing', () => {
    render(<Stage stream={fakeStream()} sharerName="Bo" isLocal={false} />);

    expect(screen.getByText(/Bo/)).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeNull();
  });

  it('names your own screen as yours rather than by your name', () => {
    render(<Stage stream={fakeStream()} sharerName="You" isLocal />);

    expect(screen.getByText(/your screen/i)).toBeInTheDocument();
  });

  it('mutes the local preview so a shared tab does not echo', () => {
    render(<Stage stream={fakeStream()} sharerName="You" isLocal />);

    expect(document.querySelector('video')).toHaveProperty('muted', true);
  });

  it('holds its place while a shared screen has not arrived yet', () => {
    render(<Stage stream={null} sharerName="Bo" isLocal={false} />);

    expect(screen.getByText(/Bo/)).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });
});
