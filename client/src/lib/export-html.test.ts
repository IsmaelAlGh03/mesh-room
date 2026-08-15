import { describe, expect, it } from 'vitest';
import { renderTranscript, transcriptFilename } from './export-html';
import type { TranscriptEntry } from './export-html';

const AT = new Date(2026, 7, 15, 14, 2).getTime();
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function entry(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return { authorName: 'Ada', at: AT, text: 'hello', ...overrides };
}

function render(entries: TranscriptEntry[]): string {
  return renderTranscript({ roomId: 'quiet-harbour', takenAt: AT, entries });
}

describe('renderTranscript', () => {
  it('carries the name, the time and the words of a message', () => {
    const html = render([entry()]);

    expect(html).toContain('Ada');
    expect(html).toContain('hello');
    expect(html).toMatch(/\d{1,2}:\d{2}/);
  });

  it('names the room and says when the copy was taken', () => {
    const html = render([entry()]);

    expect(html).toContain('quiet-harbour');
    expect(html).toContain('2026-08-15');
  });

  it('opens as a standalone document', () => {
    const html = render([entry()]);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('</html>');
  });

  it('embeds the three typefaces so it reads the same offline', () => {
    const html = render([entry()]);

    expect(html).toContain("font-family: 'Syne'");
    expect(html).toContain("font-family: 'Space Grotesk'");
    expect(html).toContain("font-family: 'Space Mono'");
    expect(html.match(/data:font\/woff2;base64,/g)).toHaveLength(3);
  });

  it('keeps the caveat that the app states permanently', () => {
    const html = render([entry()]);

    expect(html).toContain('You only have messages from after you joined. Nothing is kept.');
  });

  it('still produces a document when nobody said anything', () => {
    const html = render([]);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('quiet-harbour');
    expect(html).toContain('Nothing is kept.');
    expect(html).not.toContain('<article');
  });

  it('never lets a script through, whichever field carries it', () => {
    const html = render([
      entry({ authorName: '<script>alert(1)</script>', text: '<script>alert(2)</script>' }),
      entry({
        text: '',
        attachment: {
          name: '<script>alert(3)</script>.png',
          mime: 'image/png',
          size: 10,
          dataUrl: PIXEL,
        },
      }),
    ]);

    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('escapes a quote so it cannot break out of an attribute', () => {
    const html = render([entry({ authorName: 'Ada" onload="alert(1)' })]);

    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('inlines an image as a data URL', () => {
    const html = render([
      entry({
        text: '',
        attachment: { name: 'shore.png', mime: 'image/png', size: 4096, dataUrl: PIXEL },
      }),
    ]);

    expect(html).toContain(`src="${PIXEL}"`);
    expect(html).toContain('alt="shore.png"');
    expect(html).toContain('4KB');
  });

  it('refuses a mime outside the image allowlist, and keeps its payload out of the document', () => {
    const payload = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
    const html = render([
      entry({
        text: '',
        attachment: { name: 'trap.html', mime: 'text/html', size: 40, dataUrl: payload },
      }),
    ]);

    expect(html).not.toContain(payload);
    expect(html).not.toContain('<img');
    expect(html).toContain('trap.html');
    expect(html).toContain('Not included');
  });

  it('refuses a payload that lies about itself, even when the mime looks fine', () => {
    const payload = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
    const html = render([
      entry({
        text: '',
        attachment: { name: 'liar.png', mime: 'image/png', size: 40, dataUrl: payload },
      }),
    ]);

    expect(html).not.toContain(payload);
    expect(html).not.toContain('<img');
    expect(html).toContain('Not included');
  });

  it('names an image it could not read rather than dropping it silently', () => {
    const html = render([
      entry({
        text: '',
        attachment: { name: 'lost.png', mime: 'image/png', size: 4096, dataUrl: '' },
      }),
    ]);

    expect(html).not.toContain('<img');
    expect(html).toContain('lost.png');
    expect(html).toContain('Not included');
  });
});

describe('transcriptFilename', () => {
  it('dates and times the file so two copies do not collide', () => {
    expect(transcriptFilename('quiet-harbour', AT)).toBe(
      'mesh-room-quiet-harbour-2026-08-15-1402.html',
    );
  });

  it('strips anything a room id has no business putting in a filename', () => {
    expect(transcriptFilename('../etc/passwd', AT)).toBe('mesh-room-etcpasswd-2026-08-15-1402.html');
    expect(transcriptFilename('two words', AT)).toBe('mesh-room-twowords-2026-08-15-1402.html');
  });

  it('falls back to a name when the room id survives as nothing', () => {
    expect(transcriptFilename('///', AT)).toBe('mesh-room-2026-08-15-1402.html');
  });
});
