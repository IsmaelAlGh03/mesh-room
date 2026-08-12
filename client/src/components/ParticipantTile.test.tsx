import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ParticipantTile } from './ParticipantTile';

function streamWithVideo(): MediaStream {
  const track = {
    kind: 'video',
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  };
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

function streamWithoutVideo(): MediaStream {
  return { getVideoTracks: () => [] } as unknown as MediaStream;
}

describe('ParticipantTile', () => {
  it('says why a peer has no picture yet', () => {
    render(<ParticipantTile displayName="Priya" stream={null} state="connecting" />);

    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getAllByText('Connecting…').length).toBeGreaterThan(0);
  });

  it('separates a camera that is off from a peer still connecting', () => {
    render(<ParticipantTile displayName="Yusuf" stream={streamWithoutVideo()} state="connected" />);

    expect(screen.getByText('Camera off')).toBeInTheDocument();
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument();
  });

  it('reads your own resolution off the track and marks the tile as yours', () => {
    render(
      <ParticipantTile displayName="Ismael" stream={streamWithVideo()} state="connected" isLocal />,
    );

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('1280×720')).toBeInTheDocument();
    expect(screen.getByText('30fps')).toBeInTheDocument();
  });

  it('shows no status word once a peer has video', () => {
    render(<ParticipantTile displayName="Sam" stream={streamWithVideo()} state="connected" />);

    expect(screen.queryByText('Camera off')).not.toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
