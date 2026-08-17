import { useEffect, useRef } from 'react';
import { MeshNode } from './MeshNode';

interface StageProps {
  stream: MediaStream | null;
  sharerName: string;
  isLocal: boolean;
}

export function Stage({ stream, sharerName, isLocal }: StageProps): JSX.Element {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current !== null) video.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className="m-0 flex min-h-[200px] flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center border-[1.5px] border-ink">
        {stream === null ? (
          <MeshNode className="h-4 w-4 opacity-55" />
        ) : (
          <video
            ref={video}
            aria-label={isLocal ? 'Your screen' : `${sharerName}'s screen`}
            autoPlay
            playsInline
            muted
            className="mesh-fade h-full w-full object-contain"
          />
        )}
      </div>

      <figcaption className="mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] uppercase opacity-65">
        <MeshNode className="h-3 w-3" />
        {isLocal ? 'Your screen' : `${sharerName} is sharing`}
      </figcaption>
    </figure>
  );
}
