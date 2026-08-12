const ADJECTIVES: [string, ...string[]] = [
  'quiet', 'open', 'narrow', 'distant', 'shallow', 'amber', 'northern', 'hollow',
  'copper', 'still', 'passing', 'linen', 'winter', 'rough', 'plain', 'steady',
];

const NOUNS: [string, ...string[]] = [
  'harbor', 'signal', 'anchor', 'lantern', 'ferry', 'meadow', 'beacon', 'cabin',
  'thicket', 'current', 'orchard', 'bridge', 'shoreline', 'station', 'valley', 'kiln',
];

const ROOM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function pick(words: [string, ...string[]]): string {
  return words[Math.floor(Math.random() * words.length)] ?? words[0];
}

export function createRoomId(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(Math.random() * 90) + 10}`;
}

export function parseRoomId(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return null;

  const candidate = trimmed.match(/\/room\/([^/?#]+)/)?.[1] ?? trimmed;

  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}
