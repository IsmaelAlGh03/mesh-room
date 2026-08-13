import { MeshNode } from './MeshNode';

interface RoomCountProps {
  count: number | null;
  capacity: number;
}

const WORDS = ['nobody', 'one', 'two', 'three', 'four', 'five', 'six'];

function inWords(value: number): string {
  return WORDS[value] ?? String(value);
}

function sentence(count: number, capacity: number): string {
  if (count === 0) return "Nobody else is here yet. Share the link and they'll appear.";
  if (count >= capacity) {
    return `This room already has ${inWords(capacity)} people in it. Wait for someone to leave, or start a room of your own.`;
  }
  return count === 1
    ? 'One person is already in this room.'
    : `${inWords(count).replace(/^./, (c) => c.toUpperCase())} people are already in this room.`;
}

function Seat({ kind }: { kind: 'taken' | 'free' | 'yours' }): JSX.Element {
  if (kind === 'yours') {
    return (
      <span data-seat="yours" title="You">
        <MeshNode ringed className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span data-seat={kind} className={kind === 'free' ? 'opacity-30' : undefined}>
      <MeshNode className="h-3 w-3" />
    </span>
  );
}

export function RoomCount({ count, capacity }: RoomCountProps): JSX.Element {
  if (count === null) {
    return (
      <p className="font-mono text-[11px] tracking-[0.06em] uppercase opacity-55">
        Counting who's here…
      </p>
    );
  }

  const taken = Math.min(count, capacity);
  const free = Math.max(capacity - taken - 1, 0);
  const full = taken >= capacity;

  return (
    <div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {!full && <Seat kind="yours" />}
        {Array.from({ length: taken }, (_, index) => (
          <Seat key={`taken-${index}`} kind="taken" />
        ))}
        {Array.from({ length: free }, (_, index) => (
          <Seat key={`free-${index}`} kind="free" />
        ))}
        {full && (
          <span data-outside className="ml-3 flex items-center border-l-[1.5px] border-ink/25 pl-3">
            <Seat kind="yours" />
          </span>
        )}
      </div>
      <p aria-live="polite" className="mt-3 max-w-[34ch] text-[13px] leading-snug">
        {sentence(count, capacity)}
      </p>
    </div>
  );
}
