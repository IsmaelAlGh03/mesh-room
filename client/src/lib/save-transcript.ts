import type { ChatMessage } from '../types';
import { renderTranscript, transcriptFilename } from './export-html';
import type { TranscriptEntry } from './export-html';

interface ReadImage {
  mime: string;
  dataUrl: string;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function readImage(url: string): Promise<ReadImage | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return { mime: blob.type, dataUrl: await readAsDataUrl(blob) };
  } catch {
    return null;
  }
}

async function toEntry(message: ChatMessage): Promise<TranscriptEntry> {
  const entry: TranscriptEntry = {
    authorName: message.authorName,
    at: message.at,
    text: message.text,
  };

  if (message.attachment === undefined) return entry;

  // The blob's type was coerced through the allowlist on receive; the message kept the peer's word for it.
  const read = await readImage(message.attachment.url);

  return {
    ...entry,
    attachment: {
      name: message.attachment.name,
      size: message.attachment.size,
      mime: read?.mime ?? '',
      dataUrl: read?.dataUrl ?? '',
    },
  };
}

function offerFile(html: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveTranscript(messages: ChatMessage[], roomId: string): Promise<void> {
  const takenAt = Date.now();
  const entries = await Promise.all(messages.map(toEntry));

  offerFile(renderTranscript({ roomId, takenAt, entries }), transcriptFilename(roomId, takenAt));
}
