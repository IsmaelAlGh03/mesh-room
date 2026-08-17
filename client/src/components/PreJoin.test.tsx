import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreJoin } from './PreJoin';

const socket = { connected: true, on: vi.fn(), off: vi.fn(), connect: vi.fn() };

vi.mock('../socket', () => ({ getSocket: () => socket }));

function fakeStream(): MediaStream {
  const video = { kind: 'video', enabled: true, stop: vi.fn(), getSettings: () => ({ width: 640, height: 480, frameRate: 30 }) };
  const audio = { kind: 'audio', enabled: true, stop: vi.fn() };
  return {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
}

const devices = [
  { kind: 'videoinput', deviceId: 'cam-1', label: 'Built-in Camera' },
  { kind: 'videoinput', deviceId: 'cam-2', label: 'Studio Camera' },
  { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Microphone' },
] as MediaDeviceInfo[];

function setupMedia(getUserMedia: () => Promise<MediaStream>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(getUserMedia),
      enumerateDevices: vi.fn(async () => devices),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

beforeEach(() => {
  setupMedia(async () => fakeStream());
  socket.connected = true;
});

describe('PreJoin', () => {
  it('will not let you join without a name', async () => {
    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    const join = await screen.findByRole('button', { name: /join/i });
    expect(join).toBeDisabled();
  });

  it('joins with the name, the stream and the toggle states', async () => {
    const onJoin = vi.fn();
    render(<PreJoin roomId="alpha" count={2} capacity={6} onJoin={onJoin} />);

    await screen.findByRole('button', { name: /join/i });
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: /camera on/i }));
    await userEvent.click(screen.getByRole('button', { name: /join/i }));

    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Ada', micOn: true, cameraOn: false }),
    );
  });

  it('treats a whitespace-only name as no name at all', async () => {
    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    await screen.findByRole('button', { name: /join/i });
    await userEvent.type(screen.getByLabelText(/your name/i), '   ');

    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  it('still lets you join when the camera is blocked', async () => {
    setupMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ada');
    expect(screen.getByRole('button', { name: /join/i })).toBeEnabled();
  });

  it('offers the cameras it found once permission is granted', async () => {
    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    const cameras = await screen.findByLabelText('Camera');
    expect(cameras).toHaveTextContent('Built-in Camera');
    expect(cameras).toHaveTextContent('Studio Camera');
  });

  it('re-acquires and stops the old tracks when you pick another camera', async () => {
    const first = fakeStream();
    const second = fakeStream();
    let call = 0;
    setupMedia(async () => (call++ === 0 ? first : second));

    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);
    await screen.findByRole('button', { name: /join/i });

    await userEvent.selectOptions(screen.getByLabelText('Camera'), 'cam-2');

    await waitFor(() => expect(first.getTracks()[0]?.stop).toHaveBeenCalled());
  });

  it('leaves the stream alive for the room once it has handed it over', async () => {
    const stream = fakeStream();
    setupMedia(async () => stream);
    const { unmount } = render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    await screen.findByRole('button', { name: /join/i });
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: /join/i }));
    unmount();

    expect(stream.getTracks()[0]?.stop).not.toHaveBeenCalled();
  });

  it('stops the camera if you leave without joining', async () => {
    const stream = fakeStream();
    setupMedia(async () => stream);
    const { unmount } = render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    await screen.findByRole('button', { name: /join/i });
    unmount();

    expect(stream.getTracks()[0]?.stop).toHaveBeenCalled();
  });

  it('cannot be joined when the room is full', async () => {
    render(<PreJoin roomId="alpha" count={6} capacity={6} onJoin={vi.fn()} />);

    await screen.findByRole('button', { name: /join/i });
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ada');

    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  it('explains a sleeping server once the wait gets long, and holds Join back', async () => {
    socket.connected = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<PreJoin roomId="alpha" count={null} capacity={6} onJoin={vi.fn()} />);

      expect(screen.queryByText(/waking the server up/i)).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(3100);
      });

      expect(screen.getByText(/waking the server up/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing about the server when it answers straight away', async () => {
    render(<PreJoin roomId="alpha" count={0} capacity={6} onJoin={vi.fn()} />);

    await screen.findByRole('button', { name: /join/i });

    expect(screen.queryByText(/waking the server up/i)).not.toBeInTheDocument();
  });
});
