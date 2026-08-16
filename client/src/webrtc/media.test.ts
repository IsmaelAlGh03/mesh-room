import { describe, expect, it, vi } from 'vitest';
import { describeMediaError, openMedia } from './media';

const stream = { id: 'fake' } as unknown as MediaStream;
const fail = (name: string): DOMException => new DOMException('no', name);

describe('openMedia', () => {
  it('returns the full stream when both devices are granted', async () => {
    const request = vi.fn().mockResolvedValue(stream);
    const result = await openMedia(request, undefined, true);

    expect(result).toEqual({ stream, mode: 'full', error: null });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ video: true, audio: true });
  });

  it('falls back to audio when the camera is refused', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(fail('NotReadableError'))
      .mockResolvedValueOnce(stream);

    const result = await openMedia(request, undefined, true);

    expect(result.mode).toBe('audio-only');
    expect(result.stream).toBe(stream);
    expect(result.error).toBe('Another app is using your camera. Close it, then reload.');
    expect(request).toHaveBeenNthCalledWith(2, { audio: true });
  });

  it('falls all the way to view-only when both are refused', async () => {
    const request = vi.fn().mockRejectedValue(fail('NotAllowedError'));
    const result = await openMedia(request, undefined, true);

    expect(result.stream).toBeNull();
    expect(result.mode).toBe('view-only');
    expect(result.error).toBe(
      'Your browser is blocking the camera and microphone. Allow them, then reload.',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('carries the caller device choice into both rungs', async () => {
    const video = { deviceId: { exact: 'cam1' } };
    const audio = { deviceId: { exact: 'mic1' } };
    const request = vi
      .fn()
      .mockRejectedValueOnce(fail('NotFoundError'))
      .mockResolvedValueOnce(stream);

    await openMedia(request, { video, audio }, true);

    expect(request).toHaveBeenNthCalledWith(1, { video, audio });
    expect(request).toHaveBeenNthCalledWith(2, { audio });
  });

  it('does not ask twice off a secure origin, where nothing can work', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('no mediaDevices'));
    const result = await openMedia(request, undefined, false);

    expect(result.mode).toBe('view-only');
    expect(result.error).toContain('secure connection');
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('describeMediaError', () => {
  const denied = new DOMException('denied', 'NotAllowedError');

  it('names the secure connection when the page is not a secure context', () => {
    expect(describeMediaError(new TypeError('x'), false)).toBe(
      'The camera and microphone need a secure connection. Open this page over HTTPS.',
    );
  });

  it('blames the secure context before the error, since mediaDevices is missing entirely', () => {
    expect(describeMediaError(denied, false)).toContain('secure connection');
  });

  it('still reports a blocked permission on a secure page', () => {
    expect(describeMediaError(denied, true)).toBe(
      'Your browser is blocking the camera and microphone. Allow them, then reload.',
    );
  });

  it('names a camera held by another app', () => {
    expect(describeMediaError(new DOMException('busy', 'NotReadableError'), true)).toBe(
      'Another app is using your camera. Close it, then reload.',
    );
  });

  it('names a missing device', () => {
    expect(describeMediaError(new DOMException('none', 'NotFoundError'), true)).toBe(
      'No camera or microphone found. Connect one, then reload.',
    );
  });

  it('falls back to the generic message for an unknown error on a secure page', () => {
    expect(describeMediaError(new TypeError('something else'), true)).toBe(
      'The camera and microphone would not start. Reload to try again.',
    );
  });
});
