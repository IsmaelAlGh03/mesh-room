import displayFont from '@fontsource/syne/files/syne-latin-800-normal.woff2?inline';
import sansFont from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2?inline';
import monoFont from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff2?inline';
import { describeAttachment, isAllowedImage } from '../webrtc/chunker';

export interface TranscriptAttachment {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

export interface TranscriptEntry {
  authorName: string;
  at: number;
  text: string;
  attachment?: TranscriptAttachment;
}

export interface Transcript {
  roomId: string;
  takenAt: number;
  entries: TranscriptEntry[];
}

export const TRANSCRIPT_CAVEAT =
  'You only have messages from after you joined. Nothing is kept.';

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateStamp(at: number): string {
  const when = new Date(at);
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

function clockStamp(at: number): string {
  const when = new Date(at);
  return `${pad(when.getHours())}${pad(when.getMinutes())}`;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function transcriptFilename(roomId: string, takenAt: number): string {
  const slug = roomId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const parts = ['mesh-room', slug, dateStamp(takenAt), clockStamp(takenAt)];
  return `${parts.filter((part) => part !== '').join('-')}.html`;
}

function renderAttachment(attachment: TranscriptAttachment): string {
  const caption = escapeHtml(describeAttachment(attachment));
  const showable = isAllowedImage(attachment.mime) && IMAGE_DATA_URL.test(attachment.dataUrl);

  if (!showable) {
    return `<span class="missing"><span class="label">Not included</span> ${caption}</span>`;
  }

  return `<img src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name)}" loading="lazy"><span class="caption">${caption}</span>`;
}

function renderEntry(entry: TranscriptEntry): string {
  const body =
    entry.attachment === undefined
      ? escapeHtml(entry.text)
      : renderAttachment(entry.attachment);

  return [
    '<article>',
    `<span class="who">${escapeHtml(entry.authorName)}</span>`,
    `<span class="when">${escapeHtml(formatTime(entry.at))}</span>`,
    `<span class="said">${body}</span>`,
    '</article>',
  ].join('');
}

function styles(): string {
  return `
@font-face { font-family: 'Syne'; font-weight: 800; font-display: swap; src: url(${displayFont}) format('woff2'); }
@font-face { font-family: 'Space Grotesk'; font-weight: 400; font-display: swap; src: url(${sansFont}) format('woff2'); }
@font-face { font-family: 'Space Mono'; font-weight: 400; font-display: swap; src: url(${monoFont}) format('woff2'); }

:root { color-scheme: light dark; --substrate: #e4eaee; --ink: #0f2230; }
@media (prefers-color-scheme: dark) { :root { --substrate: #141719; --ink: #e6e4df; } }

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2.5rem 1.5rem 3rem;
  background: var(--substrate);
  color: var(--ink);
  font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
}
.sheet { max-width: 48rem; margin: 0 auto; }
h1 { font-family: 'Syne', ui-sans-serif, system-ui, sans-serif; font-weight: 800; font-size: 2rem; letter-spacing: -0.02em; margin: 0; }
.eyebrow, .meta, .when, .caption, .label { font-family: 'Space Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.05em; }
.eyebrow, .label { text-transform: uppercase; }
.eyebrow { margin: 0 0 0.5rem; opacity: 0.7; }
.meta { margin: 0.75rem 0 0; opacity: 0.7; }
header { border-bottom: 1.5px solid var(--ink); padding-bottom: 1.5rem; }
main { padding: 1.5rem 0; }
article { display: grid; grid-template-columns: 7rem 3.5rem 1fr; gap: 0 0.75rem; padding: 0.35rem 0; align-items: start; }
.who { font-weight: 500; overflow-wrap: anywhere; }
.when { opacity: 0.6; padding-top: 0.3rem; font-variant-numeric: tabular-nums; }
.said { overflow-wrap: anywhere; }
.said img { display: block; max-width: 100%; height: auto; border: 1.5px solid var(--ink); }
.caption { display: block; margin-top: 0.4rem; opacity: 0.7; }
.missing { display: inline-flex; gap: 0.6rem; align-items: baseline; border: 1.5px solid var(--ink); padding: 0.4rem 0.6rem; }
footer { border-top: 1.5px solid var(--ink); padding-top: 1rem; }
footer p { font-family: 'Space Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.05em; opacity: 0.7; margin: 0; }
@media (max-width: 34rem) { article { grid-template-columns: 1fr; gap: 0; } .when { display: block; margin-bottom: 0.15rem; } }
`.trim();
}

export function renderTranscript(transcript: Transcript): string {
  const room = escapeHtml(transcript.roomId);
  const taken = `${dateStamp(transcript.takenAt)} ${escapeHtml(formatTime(transcript.takenAt))}`;

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>mesh-room — ${room}</title>`,
    `<style>${styles()}</style>`,
    '</head>',
    '<body>',
    '<div class="sheet">',
    '<header>',
    '<p class="eyebrow">Chat transcript</p>',
    '<h1 translate="no">mesh-room</h1>',
    `<p class="meta">${room} · ${taken}</p>`,
    '</header>',
    `<main>${transcript.entries.map(renderEntry).join('')}</main>`,
    `<footer><p>${TRANSCRIPT_CAVEAT}</p></footer>`,
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}
