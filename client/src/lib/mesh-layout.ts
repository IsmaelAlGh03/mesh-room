export interface NodePoint {
  id: string;
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

const ROW_TOLERANCE = 1;
const BOW = 0.2;
const RING_INSET = 0.34;

const near = (one: number, other: number): boolean => Math.abs(one - other) <= ROW_TOLERANCE;

const sameRow = (a: NodePoint, b: NodePoint): boolean => near(a.y, b.y);

function hasNodeBetween(a: NodePoint, b: NodePoint, nodes: NodePoint[]): boolean {
  const low = Math.min(a.x, b.x);
  const high = Math.max(a.x, b.x);

  return nodes.some(
    (node) => node !== a && node !== b && sameRow(node, a) && node.x > low && node.x < high,
  );
}

export function pathFor(a: NodePoint, b: NodePoint, nodes: NodePoint[]): string {
  const start = `M${a.x} ${a.y}`;

  if (!sameRow(a, b) || !hasNodeBetween(a, b, nodes)) return `${start} L${b.x} ${b.y}`;

  const top = Math.min(...nodes.map((node) => node.y));
  const direction = near(a.y, top) ? -1 : 1;
  const control = a.y + direction * Math.abs(b.x - a.x) * BOW;

  return `${start} Q${(a.x + b.x) / 2} ${control} ${b.x} ${b.y}`;
}

export function ringNodes(ids: string[], box: Box): NodePoint[] {
  const centreX = box.width / 2;
  const centreY = box.height / 2;

  if (ids.length === 1) return [{ id: ids[0] ?? '', x: centreX, y: centreY }];

  const radius = Math.min(box.width, box.height) * RING_INSET;

  return ids.map((id, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / ids.length;
    return { id, x: centreX + radius * Math.cos(angle), y: centreY + radius * Math.sin(angle) };
  });
}
