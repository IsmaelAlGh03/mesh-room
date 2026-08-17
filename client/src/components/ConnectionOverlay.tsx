import { useState } from 'react';
import { pathFor, type NodePoint } from '../lib/mesh-layout';
import { formatFields } from '../webrtc/quality';
import { LOCAL_ID, type MeshLink } from '../webrtc/mesh-links';

interface ConnectionOverlayProps {
  nodes: NodePoint[];
  links: MeshLink[];
  names: Record<string, string>;
  width: number;
  height: number;
  // The ring leaves the tiles behind, so it has to carry the names the captions would have given.
  labelled?: boolean;
}

const HIT_WIDTH = 20;

const keyOf = (link: MeshLink): string => `${link.a}|${link.b}`;

const isWrong = (link: MeshLink): boolean => link.relayed || link.bucket === 'poor';

function figuresFor(link: MeshLink): string[] {
  if (link.bucket === null) return [];

  return formatFields({
    rtt: link.rtt,
    loss: link.loss,
    bitrate: null,
    bucket: link.bucket,
    relayed: link.relayed,
  });
}

const MAX_LABELS = 3;

// The earned-label rule bounds which links are annotated, not how many, so labels stacked.
function labelledKeys(links: MeshLink[]): Set<string> {
  const ranked = links
    .filter(isWrong)
    .sort((one, other) => {
      if ((one.bucket === 'poor') !== (other.bucket === 'poor')) {
        return one.bucket === 'poor' ? -1 : 1;
      }
      return (other.rtt ?? 0) - (one.rtt ?? 0);
    })
    .slice(0, MAX_LABELS);

  return new Set(ranked.map(keyOf));
}

function strokeOf(link: MeshLink): { width: number; className: string; dash?: string } {
  const degraded = link.bucket === 'poor';

  return {
    width: degraded ? 2.4 : link.relayed ? 1.6 : 1.3,
    className: isWrong(link) ? 'stroke-alert' : 'stroke-ink opacity-80',
    ...(link.relayed ? { dash: '5 4' } : {}),
  };
}

export function ConnectionOverlay({
  nodes,
  links,
  names,
  width,
  height,
  labelled = false,
}: ConnectionOverlayProps): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const at = new Map(nodes.map((node) => [node.id, node]));
  const named = labelledKeys(links);

  return (
    <>
      <svg
        aria-hidden="true"
        data-overlay="links"
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        {links.map((link) => {
          const a = at.get(link.a);
          const b = at.get(link.b);
          if (a === undefined || b === undefined) return null;

          const key = keyOf(link);
          const stroke = strokeOf(link);
          const wrong = isWrong(link);
          const line = pathFor(a, b, nodes);
          const label =
            named.has(key) || hovered === key || pinned === key ? figuresFor(link).join(' ') : '';

          return (
            <g key={key}>
              <path
                data-hit={key}
                d={line}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_WIDTH}
                style={{ pointerEvents: 'stroke' }}
                onPointerEnter={() => setHovered(key)}
                onPointerLeave={() => setHovered((current) => (current === key ? null : current))}
                onClick={() => setPinned((current) => (current === key ? null : key))}
              />
              <path
                data-link={key}
                d={line}
                fill="none"
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
                className={stroke.className}
              />
              {label !== '' && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  className={`font-mono text-[10px] tracking-[0.06em] uppercase ${
                    wrong ? 'fill-alert' : 'fill-ink'
                  }`}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {links.length === 0 && (
          <text
            x={width / 2}
            y={height / 2 + 34}
            textAnchor="middle"
            className="fill-ink font-mono text-[11px] tracking-[0.06em] uppercase opacity-70"
          >
            Nobody else is here yet
          </text>
        )}

        {nodes.map((node) => {
          const bad = links.some(
            (link) => (link.a === node.id || link.b === node.id) && isWrong(link),
          );

          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.id === LOCAL_ID ? 5.5 : 5}
                className={bad ? 'fill-alert' : 'fill-ink'}
              />
              {node.id === LOCAL_ID && (
                <circle
                  data-local="true"
                  cx={node.x}
                  cy={node.y}
                  r={10}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-ink"
                />
              )}
              {labelled && (
                <text
                  data-name={node.id}
                  x={node.x}
                  y={node.y - (node.id === LOCAL_ID ? 16 : 12)}
                  textAnchor="middle"
                  strokeWidth={3.5}
                  style={{ paintOrder: 'stroke' }}
                  className={`stroke-substrate text-[11px] font-medium ${
                    bad ? 'fill-alert' : 'fill-ink'
                  }`}
                >
                  {names[node.id] ?? node.id}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <ul className="sr-only">
        {links.map((link) => {
          const figures = figuresFor(link);
          const source = link.firstHand
            ? 'Your measurement'
            : `${names[link.a < link.b ? link.a : link.b] ?? 'A peer'}'s measurement`;

          return (
            <li key={keyOf(link)}>
              {names[link.a] ?? link.a} to {names[link.b] ?? link.b}:{' '}
              {figures.length === 0 ? 'Not measured yet' : `${figures.join(' ')}. ${source}`}
            </li>
          );
        })}
      </ul>
    </>
  );
}
