const NODES = [
  { x: 110, y: 24 },
  { x: 196, y: 72 },
  { x: 196, y: 142 },
  { x: 110, y: 190 },
  { x: 24, y: 142 },
  { x: 24, y: 72 },
];

const LINKS = NODES.flatMap((from, i) => NODES.slice(i + 1).map((to) => ({ from, to })));

export default function MeshMark() {
  return (
    <svg
      viewBox="0 0 220 214"
      aria-hidden="true"
      className="w-full max-w-[320px] text-ink"
    >
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.85">
        {LINKS.map(({ from, to }) => (
          <line
            key={`${from.x},${from.y}-${to.x},${to.y}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        ))}
      </g>
      <g fill="currentColor">
        {NODES.map((node) => (
          <circle key={`${node.x},${node.y}`} cx={node.x} cy={node.y} r="7" />
        ))}
      </g>
    </svg>
  );
}
