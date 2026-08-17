import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ConnectionOverlay } from './ConnectionOverlay';
import { LOCAL_ID, type MeshLink } from '../webrtc/mesh-links';
import type { NodePoint } from '../lib/mesh-layout';

const nodes: NodePoint[] = [
  { id: LOCAL_ID, x: 100, y: 50 },
  { id: 'b', x: 300, y: 50 },
  { id: 'c', x: 500, y: 50 },
];

const names = { [LOCAL_ID]: 'You', b: 'Priya', c: 'Sam' };

function link(a: string, b: string, over: Partial<MeshLink> = {}): MeshLink {
  return { a, b, bucket: 'good', rtt: 20, loss: 0.001, relayed: false, firstHand: true, ...over };
}

function overlay(links: MeshLink[]) {
  return render(
    <ConnectionOverlay nodes={nodes} links={links} names={names} width={600} height={200} />,
  );
}

describe('ConnectionOverlay', () => {
  it('draws one path per link', () => {
    const { container } = overlay([link(LOCAL_ID, 'b'), link(LOCAL_ID, 'c'), link('b', 'c')]);

    expect(container.querySelectorAll('path[data-link]')).toHaveLength(3);
  });

  it('dashes a relayed link and leaves a healthy one solid', () => {
    const { container } = overlay([link(LOCAL_ID, 'b', { relayed: true }), link('b', 'c')]);

    const [relayed, healthy] = container.querySelectorAll('path[data-link]');
    expect(relayed?.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(healthy?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('draws a degraded link heavier than a healthy one', () => {
    const { container } = overlay([link(LOCAL_ID, 'b', { bucket: 'poor' }), link('b', 'c')]);

    const [degraded, healthy] = container.querySelectorAll('path[data-link]');
    expect(Number(degraded?.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(healthy?.getAttribute('stroke-width')),
    );
  });

  it('keeps both cues when a link is relayed and degraded', () => {
    const { container } = overlay([link(LOCAL_ID, 'b', { relayed: true, bucket: 'poor' })]);

    const path = container.querySelector('path[data-link]');
    expect(path?.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(Number(path?.getAttribute('stroke-width'))).toBe(2.4);
  });

  it('annotates only the links that are wrong', () => {
    const { container } = overlay([
      link(LOCAL_ID, 'b', { relayed: true, rtt: 61 }),
      link(LOCAL_ID, 'c'),
      link('b', 'c', { bucket: 'poor', rtt: 340 }),
    ]);

    const drawn = container.querySelector('svg')?.textContent ?? '';
    expect(container.querySelectorAll('svg text')).toHaveLength(2);
    expect(drawn).not.toContain('20ms');
    expect(drawn).toContain('61ms');
    expect(drawn).toContain('340ms');
  });

  it('reveals figures for a healthy link on hover', async () => {
    const user = userEvent.setup();
    const { container } = overlay([link(LOCAL_ID, 'b', { rtt: 20 })]);

    expect(container.querySelectorAll('svg text')).toHaveLength(0);
    await user.hover(container.querySelector('path[data-hit]')!);
    expect(container.querySelector('svg text')?.textContent).toContain('20ms');
  });

  it('reveals the same figures on tap', async () => {
    const user = userEvent.setup();
    const { container } = overlay([link(LOCAL_ID, 'b', { rtt: 20 })]);

    await user.click(container.querySelector('path[data-hit]')!);
    expect(container.querySelector('svg text')?.textContent).toContain('20ms');
  });

  it('lists every link for assistive tech, naming whose measurement it is', () => {
    overlay([link(LOCAL_ID, 'b'), link('b', 'c', { firstHand: false, rtt: 44 })]);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('You');
    expect(items[0]?.textContent).toContain('Priya');
    expect(items[1]?.textContent).toContain('44ms');
    expect(items[1]?.textContent).toMatch(/Priya's measurement/);
  });

  it('says so when a link has no figures yet', () => {
    overlay([link('b', 'c', { bucket: null, rtt: null, loss: null, firstHand: false })]);

    expect(screen.getByRole('listitem').textContent).toMatch(/Not measured yet/);
  });

  it('says you are alone rather than drawing an empty diagram', () => {
    const { container } = render(
      <ConnectionOverlay nodes={[nodes[0]!]} links={[]} names={names} width={600} height={200} />,
    );

    expect(container.querySelector('svg')?.textContent).toMatch(/Nobody else is here yet/i);
  });

  it('gives every link a hit target far wider than the line it draws', () => {
    const { container } = overlay([link(LOCAL_ID, 'b')]);

    const hit = container.querySelector('path[data-hit]');
    const line = container.querySelector('path[data-link]');

    expect(hit?.getAttribute('d')).toBe(line?.getAttribute('d'));
    expect(Number(hit?.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(line?.getAttribute('stroke-width')) * 5,
    );
  });

  it('names every node when the drawing has left the tiles behind', () => {
    const { container } = render(
      <ConnectionOverlay
        nodes={nodes}
        links={[link(LOCAL_ID, 'b')]}
        names={names}
        width={600}
        height={200}
        labelled
      />,
    );

    const labels = [...container.querySelectorAll('text[data-name]')].map((t) => t.textContent);
    expect(labels).toEqual(['You', 'Priya', 'Sam']);
  });

  it('leaves nodes unnamed over the grid, where the captions already name them', () => {
    const { container } = overlay([link(LOCAL_ID, 'b')]);

    expect(container.querySelectorAll('text[data-name]')).toHaveLength(0);
  });

  it('marks a node whose link is wrong, so the bad peer is findable', () => {
    const { container } = render(
      <ConnectionOverlay
        nodes={nodes}
        links={[link(LOCAL_ID, 'c', { relayed: true }), link(LOCAL_ID, 'b')]}
        names={names}
        width={600}
        height={200}
        labelled
      />,
    );

    const sam = container.querySelector('text[data-name="c"]');
    const priya = container.querySelector('text[data-name="b"]');
    expect(sam?.getAttribute('class')).toContain('fill-alert');
    expect(priya?.getAttribute('class')).toContain('fill-ink');
  });

  it('annotates only the worst few when many links go bad at once', () => {
    const four: NodePoint[] = [
      { id: LOCAL_ID, x: 100, y: 50 },
      { id: 'b', x: 300, y: 50 },
      { id: 'c', x: 100, y: 250 },
      { id: 'd', x: 300, y: 250 },
    ];
    const fourNames = { [LOCAL_ID]: 'You', b: 'Priya', c: 'Sam', d: 'Dara' };

    const bad = [
      link(LOCAL_ID, 'b', { bucket: 'poor', rtt: 900 }),
      link(LOCAL_ID, 'c', { bucket: 'poor', rtt: 800 }),
      link(LOCAL_ID, 'd', { bucket: 'poor', rtt: 700 }),
      link('b', 'c', { bucket: 'poor', rtt: 600 }),
      link('c', 'd', { relayed: true, rtt: 500 }),
    ];

    const { container } = render(
      <ConnectionOverlay nodes={four} links={bad} names={fourNames} width={600} height={400} />,
    );

    const drawn = container.querySelector('svg')?.textContent ?? '';
    expect(container.querySelectorAll('svg text')).toHaveLength(3);
    expect(drawn).toContain('900ms');
    expect(drawn).toContain('700ms');
    expect(drawn).not.toContain('600ms');
    expect(drawn).not.toContain('500ms');

    // Every bad link keeps its stroke; only the labels are capped.
    expect(container.querySelectorAll('path[data-link]')).toHaveLength(5);
  });

  it('rings the local node', () => {
    const { container } = overlay([link(LOCAL_ID, 'b')]);

    expect(container.querySelector('circle[data-local="true"]')).toBeInTheDocument();
  });
});
