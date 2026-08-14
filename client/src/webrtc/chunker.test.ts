import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  createReassembler,
  decodeChunk,
  describeAttachment,
  encodeChunk,
  planChunks,
  rejectAttachment,
} from './chunker';

function bytes(length: number, seed = 1): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) data[i] = (i * seed) % 251;
  return data;
}

describe('rejectAttachment', () => {
  it('accepts a normal image', () => {
    expect(rejectAttachment({ type: 'image/png', size: 2048 })).toBeNull();
  });

  it('turns away anything that is not a common image type', () => {
    expect(rejectAttachment({ type: 'application/pdf', size: 2048 })).toMatch(/image/i);
    expect(rejectAttachment({ type: 'image/svg+xml', size: 2048 })).toMatch(/image/i);
  });

  it('turns away an image over the cap, and says the limit', () => {
    const message = rejectAttachment({ type: 'image/jpeg', size: MAX_ATTACHMENT_BYTES + 1 });

    expect(message).not.toBeNull();
    expect(message).toMatch(/5MB/);
  });

  it('takes an image exactly at the cap', () => {
    expect(rejectAttachment({ type: 'image/jpeg', size: MAX_ATTACHMENT_BYTES })).toBeNull();
  });

  it('turns away an empty file', () => {
    expect(rejectAttachment({ type: 'image/png', size: 0 })).not.toBeNull();
  });
});

describe('planChunks', () => {
  it('splits into pieces no larger than the chunk size', () => {
    const chunks = planChunks(bytes(40000), 16384);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.length).toBe(16384);
    expect(chunks[1]?.length).toBe(16384);
    expect(chunks[2]?.length).toBe(40000 - 32768);
  });

  it('keeps a single chunk for something smaller than the chunk size', () => {
    expect(planChunks(bytes(100), 16384)).toHaveLength(1);
  });

  it('produces nothing for empty input', () => {
    expect(planChunks(new Uint8Array(0), 16384)).toHaveLength(0);
  });
});

describe('createReassembler', () => {
  const meta = { id: 'a1', name: 'shot.png', mime: 'image/png', size: 40000, chunks: 3 };

  it('rebuilds the original bytes in order', () => {
    const original = bytes(40000, 7);
    const pieces = planChunks(original, 16384);
    const reassembler = createReassembler();

    reassembler.begin(meta);
    pieces.forEach((piece, index) => reassembler.accept('a1', index, piece));
    const done = reassembler.end('a1');

    expect(done).not.toBeNull();
    expect(done?.mime).toBe('image/png');
    expect(done?.bytes).toEqual(original);
  });

  it('rebuilds correctly when chunks arrive out of order', () => {
    const original = bytes(40000, 3);
    const pieces = planChunks(original, 16384);
    const reassembler = createReassembler();

    reassembler.begin(meta);
    reassembler.accept('a1', 2, pieces[2] as Uint8Array);
    reassembler.accept('a1', 0, pieces[0] as Uint8Array);
    reassembler.accept('a1', 1, pieces[1] as Uint8Array);

    expect(reassembler.end('a1')?.bytes).toEqual(original);
  });

  it('refuses to finish while a chunk is missing', () => {
    const pieces = planChunks(bytes(40000), 16384);
    const reassembler = createReassembler();

    reassembler.begin(meta);
    reassembler.accept('a1', 0, pieces[0] as Uint8Array);
    reassembler.accept('a1', 2, pieces[2] as Uint8Array);

    expect(reassembler.end('a1')).toBeNull();
  });

  it('refuses a transfer whose bytes do not add up to the size it announced', () => {
    const reassembler = createReassembler();

    reassembler.begin({ ...meta, size: 999999 });
    planChunks(bytes(40000), 16384).forEach((piece, index) =>
      reassembler.accept('a1', index, piece),
    );

    expect(reassembler.end('a1')).toBeNull();
  });

  it('ignores chunks for a transfer it never saw begin', () => {
    const reassembler = createReassembler();

    reassembler.accept('ghost', 0, bytes(10));

    expect(reassembler.end('ghost')).toBeNull();
  });

  it('will not begin a transfer that breaks the cap, so a peer cannot force a huge buffer', () => {
    const reassembler = createReassembler();

    expect(reassembler.begin({ ...meta, size: MAX_ATTACHMENT_BYTES + 1 })).toBe(false);
    expect(reassembler.end('a1')).toBeNull();
  });

  it('refuses a transfer that announces a type we would never render', () => {
    const reassembler = createReassembler();

    expect(reassembler.begin({ ...meta, mime: 'text/html' })).toBe(false);
    expect(reassembler.begin({ ...meta, mime: 'image/svg+xml' })).toBe(false);

    reassembler.accept('a1', 0, bytes(10));
    expect(reassembler.end('a1')).toBeNull();
  });

  it('keeps two transfers apart', () => {
    const first = bytes(20000, 2);
    const second = bytes(20000, 5);
    const reassembler = createReassembler();

    reassembler.begin({ id: 'a1', name: 'a.png', mime: 'image/png', size: 20000, chunks: 2 });
    reassembler.begin({ id: 'b2', name: 'b.png', mime: 'image/png', size: 20000, chunks: 2 });

    planChunks(first, 16384).forEach((p, i) => reassembler.accept('a1', i, p));
    planChunks(second, 16384).forEach((p, i) => reassembler.accept('b2', i, p));

    expect(reassembler.end('a1')?.bytes).toEqual(first);
    expect(reassembler.end('b2')?.bytes).toEqual(second);
  });

  it('drops what it was holding once a transfer finishes', () => {
    const pieces = planChunks(bytes(20000), 16384);
    const reassembler = createReassembler();

    reassembler.begin({ id: 'a1', name: 'a.png', mime: 'image/png', size: 20000, chunks: 2 });
    pieces.forEach((p, i) => reassembler.accept('a1', i, p));

    expect(reassembler.end('a1')).not.toBeNull();
    expect(reassembler.end('a1')).toBeNull();
  });
});

describe('encodeChunk / decodeChunk', () => {
  it('survives a round trip over the JSON envelope, including high bytes', () => {
    const original = bytes(16384, 11);

    expect(decodeChunk(encodeChunk(original))).toEqual(original);
  });

  it('handles every byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;

    expect(decodeChunk(encodeChunk(all))).toEqual(all);
  });

  it('returns null for text that is not base64, rather than throwing', () => {
    expect(decodeChunk('not base64 !!!')).toBeNull();
  });
});

describe('describeAttachment', () => {
  // Binary units throughout, because the 5MB cap is 5 × 1024 × 1024.
  it('reads as a measured figure, in the units the readouts use', () => {
    expect(describeAttachment({ name: 'shot.png', size: 2.4 * 1024 * 1024 })).toBe('shot.png · 2.4MB');
    expect(describeAttachment({ name: 'tiny.png', size: 4096 })).toBe('tiny.png · 4KB');
  });

  it('shows bytes rather than rounding a small file down to nothing', () => {
    expect(describeAttachment({ name: 'icon.png', size: 115 })).toBe('icon.png · 115B');
  });

  it('leaves the filename case alone, because a filename is an identifier', () => {
    expect(describeAttachment({ name: 'Screenshot.PNG', size: 2048 })).toBe('Screenshot.PNG · 2KB');
  });
});
