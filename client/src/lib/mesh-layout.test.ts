import { describe, expect, it } from 'vitest';
import { pathFor, ringNodes, type NodePoint } from './mesh-layout';

const row = (ids: string[], y: number, gap = 200): NodePoint[] =>
  ids.map((id, index) => ({ id, x: 100 + index * gap, y }));

describe('pathFor', () => {
  it('draws a straight line between neighbours in a row', () => {
    const nodes = row(['a', 'b', 'c'], 50);
    expect(pathFor(nodes[0]!, nodes[1]!, nodes)).toBe('M100 50 L300 50');
  });

  it('arcs a same-row pair with a node between them', () => {
    const nodes = row(['a', 'b', 'c'], 50);
    expect(pathFor(nodes[0]!, nodes[2]!, nodes)).toBe('M100 50 Q300 -30 500 50');
  });

  it('bows downward on any row that is not the top one', () => {
    const nodes = [...row(['a', 'b', 'c'], 50), ...row(['d', 'e', 'f'], 400)];
    expect(pathFor(nodes[3]!, nodes[5]!, nodes)).toBe('M100 400 Q300 480 500 400');
  });

  it('does not arc when nothing sits between the pair', () => {
    const nodes = [...row(['a', 'b'], 50), ...row(['c', 'd'], 400)];
    expect(pathFor(nodes[0]!, nodes[1]!, nodes)).toBe('M100 50 L300 50');
  });

  it('does not arc across rows', () => {
    const nodes = [...row(['a', 'b', 'c'], 50), ...row(['d', 'e', 'f'], 400)];
    expect(pathFor(nodes[0]!, nodes[4]!, nodes)).toBe('M100 50 L300 400');
  });

  // Column skips cannot occur: the grid never exceeds two rows, and below sm the ring replaces it.
  it('leaves a stacked column straight, however many nodes it holds', () => {
    const nodes: NodePoint[] = [
      { id: 'a', x: 100, y: 50 },
      { id: 'b', x: 100, y: 250 },
      { id: 'c', x: 100, y: 450 },
    ];

    expect(pathFor(nodes[0]!, nodes[2]!, nodes)).toBe('M100 50 L100 450');
  });

  it('treats rows as the same when the measured y differs by under a pixel', () => {
    const nodes: NodePoint[] = [
      { id: 'a', x: 100, y: 50 },
      { id: 'b', x: 300, y: 50.4 },
      { id: 'c', x: 500, y: 49.7 },
    ];
    expect(pathFor(nodes[0]!, nodes[2]!, nodes)).toContain('Q');
  });
});

describe('ringNodes', () => {
  it('puts the first node at the top and spaces the rest evenly', () => {
    const nodes = ringNodes(['a', 'b', 'c', 'd'], { width: 400, height: 400 });

    expect(nodes).toHaveLength(4);
    expect(nodes[0]!.x).toBeCloseTo(200);
    expect(nodes[0]!.y).toBeLessThan(200);
    expect(nodes[2]!.x).toBeCloseTo(200);
    expect(nodes[2]!.y).toBeGreaterThan(200);
  });

  it('keeps every node inside the box', () => {
    const nodes = ringNodes(['a', 'b', 'c', 'd', 'e', 'f'], { width: 342, height: 406 });

    for (const node of nodes) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(342);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(406);
    }
  });

  it('places a single node at the centre', () => {
    const [only] = ringNodes(['a'], { width: 300, height: 200 });

    expect(only?.x).toBeCloseTo(150);
    expect(only?.y).toBeCloseTo(100);
  });
});
