import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ParticipantTile } from './ParticipantTile';

function streamWithVideo(): MediaStream {
  const track = {
    kind: 'video',
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  };
  return {
    getVideoTracks: () => [track],
    getAudioTracks: () => [{ kind: 'audio', enabled: true }],
  } as unknown as MediaStream;
}

function streamWithoutVideo(): MediaStream {
  return {
    getVideoTracks: () => [],
    getAudioTracks: () => [{ kind: 'audio', enabled: true }],
  } as unknown as MediaStream;
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

  it('clears your tile when you turn your own camera off, rather than freezing a frame', () => {
    const { container } = render(
      <ParticipantTile
        displayName="Ismael"
        stream={streamWithVideo()}
        state="connected"
        isLocal
        cameraOn={false}
      />,
    );

    expect(screen.getByText('Camera off')).toBeInTheDocument();
    expect(screen.queryByText('No camera')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });

  it('reattaches the stream when you turn your camera back on', () => {
    const stream = streamWithVideo();
    const tile = (cameraOn: boolean): JSX.Element => (
      <ParticipantTile
        displayName="Ismael"
        stream={stream}
        state="connected"
        isLocal
        cameraOn={cameraOn}
      />
    );

    const { container, rerender } = render(tile(true));
    expect(container.querySelector('video')?.srcObject).toBe(stream);

    rerender(tile(false));
    expect(container.querySelector('video')).toBeNull();

    rerender(tile(true));
    expect(container.querySelector('video')?.srcObject).toBe(stream);
  });

  it('distinguishes a camera you turned off from one you never had', () => {
    render(
      <ParticipantTile
        displayName="Ismael"
        stream={streamWithoutVideo()}
        state="connected"
        isLocal
      />,
    );

    expect(screen.getByText('No camera')).toBeInTheDocument();
  });

  it('says on your own readout when your mic is muted', () => {
    render(
      <ParticipantTile
        displayName="Ismael"
        stream={streamWithVideo()}
        state="connected"
        isLocal
        micOn={false}
      />,
    );

    expect(screen.getByText('Mic off')).toBeInTheDocument();
  });

  it('leads with the name when a peer announces their camera off, rather than a black frame', () => {
    const { container } = render(
      <ParticipantTile
        displayName="Yusuf"
        stream={streamWithVideo()}
        state="connected"
        cameraOn={false}
      />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getAllByText('Yusuf').length).toBeGreaterThan(0);
    expect(screen.queryByText('Camera off')).not.toBeInTheDocument();
    expect(container.querySelector('.border-alert')).toBeNull();
  });

  it('carries a muted peer on their readout', () => {
    render(
      <ParticipantTile
        displayName="Yusuf"
        stream={streamWithVideo()}
        state="connected"
        micOn={false}
      />,
    );

    expect(screen.getByText('Mic off')).toBeInTheDocument();
  });

  it('shows no status word once a peer has video', () => {
    render(<ParticipantTile displayName="Sam" stream={streamWithVideo()} state="connected" />);

    expect(screen.queryByText('Camera off')).not.toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
