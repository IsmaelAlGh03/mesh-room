export type MediaMode = 'full' | 'audio-only' | 'view-only';

export interface MediaWanted {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

export interface MediaResult {
  stream: MediaStream | null;
  mode: MediaMode;
  error: string | null;
}

type MediaRequest = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

const BOTH: MediaWanted = { video: true, audio: true };

export function describeMediaError(
  error: unknown,
  secureContext: boolean = window.isSecureContext,
): string {
  const name = error instanceof DOMException ? error.name : '';

  // Off a secure origin there is no navigator.mediaDevices at all, so no error name is meaningful.
  if (!secureContext) {
    return 'The camera and microphone need a secure connection. Open this page over HTTPS.';
  }
  if (name === 'NotAllowedError') {
    return 'Your browser is blocking the camera and microphone. Allow them, then reload.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using your camera. Close it, then reload.';
  }
  if (name === 'NotFoundError') {
    return 'No camera or microphone found. Connect one, then reload.';
  }
  return 'The camera and microphone would not start. Reload to try again.';
}

export async function openMedia(
  request: MediaRequest,
  wanted: MediaWanted = BOTH,
  secureContext: boolean = window.isSecureContext,
): Promise<MediaResult> {
  try {
    const stream = await request({ video: wanted.video, audio: wanted.audio });
    return { stream, mode: 'full', error: null };
  } catch (error) {
    const message = describeMediaError(error, secureContext);

    // Off a secure origin the second request cannot fare better, so do not ask twice.
    if (!secureContext) return { stream: null, mode: 'view-only', error: message };

    try {
      const stream = await request({ audio: wanted.audio });
      return { stream, mode: 'audio-only', error: message };
    } catch (fallbackError) {
      return {
        stream: null,
        mode: 'view-only',
        error: describeMediaError(fallbackError, secureContext),
      };
    }
  }
}
