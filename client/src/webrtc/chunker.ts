export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const CHUNK_BYTES = 16 * 1024;

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  chunks: number;
}

export interface Attachment {
  name: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface Reassembler {
  begin(meta: AttachmentMeta): boolean;
  accept(id: string, index: number, piece: Uint8Array): void;
  end(id: string): Attachment | null;
}

export function isAllowedImage(mime: string): boolean {
  return ALLOWED_TYPES.has(mime);
}

export function rejectAttachment(file: { type: string; size: number }): string | null {
  if (!isAllowedImage(file.type)) return 'That file is not an image. Send a PNG, JPEG, GIF or WebP.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'That image is over 5MB. Send a smaller one.';
  return null;
}

export function planChunks(data: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < data.length; start += size) {
    chunks.push(data.subarray(start, Math.min(start + size, data.length)));
  }
  return chunks;
}

export function encodeChunk(piece: Uint8Array): string {
  let binary = '';
  for (const byte of piece) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeChunk(text: string): Uint8Array | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function describeAttachment(file: { name: string; size: number }): string {
  const megabytes = file.size / (1024 * 1024);
  let figure: string;

  if (megabytes >= 1) figure = `${megabytes.toFixed(1)}MB`;
  else if (file.size >= 1024) figure = `${Math.round(file.size / 1024)}KB`;
  else figure = `${file.size}B`;

  return `${file.name} · ${figure}`;
}

interface Pending {
  meta: AttachmentMeta;
  pieces: (Uint8Array | undefined)[];
}

export function createReassembler(): Reassembler {
  const pending = new Map<string, Pending>();

  return {
    begin(meta) {
      // The sender's checks prove nothing here — a peer controls every field of this message.
      if (!isAllowedImage(meta.mime)) return false;
      if (meta.size > MAX_ATTACHMENT_BYTES || meta.size <= 0 || meta.chunks <= 0) return false;
      pending.set(meta.id, { meta, pieces: new Array<Uint8Array | undefined>(meta.chunks) });
      return true;
    },

    accept(id, index, piece) {
      const held = pending.get(id);
      if (held === undefined) return;
      if (index < 0 || index >= held.meta.chunks) return;
      held.pieces[index] = piece;
    },

    end(id) {
      const held = pending.get(id);
      if (held === undefined) return null;
      pending.delete(id);

      const pieces: Uint8Array[] = [];
      let total = 0;
      for (const piece of held.pieces) {
        if (piece === undefined) return null;
        pieces.push(piece);
        total += piece.length;
      }
      if (total !== held.meta.size) return null;

      const bytes = new Uint8Array(total);
      let at = 0;
      for (const piece of pieces) {
        bytes.set(piece, at);
        at += piece.length;
      }

      return { name: held.meta.name, mime: held.meta.mime, bytes };
    },
  };
}
