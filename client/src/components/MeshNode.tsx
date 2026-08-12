interface MeshNodeProps {
  ringed?: boolean;
  className?: string;
}

export function MeshNode({ ringed = false, className = 'h-3 w-3' }: MeshNodeProps): JSX.Element {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={`shrink-0 ${className}`}>
      {ringed && (
        <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
      )}
      <circle cx="6" cy="6" r={ringed ? 2.5 : 3} fill="currentColor" />
    </svg>
  );
}
