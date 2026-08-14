import type { MeshMessage } from '../types';

export interface ChannelLinkOptions {
  connection: RTCPeerConnection;
  initiator: boolean;
  onMessage(message: MeshMessage): void;
  onOpen(): void;
}

export interface ChannelLink {
  send(message: MeshMessage): void;
  sendPaced(messages: Iterable<MeshMessage>): Promise<void>;
  close(): void;
  isOpen(): boolean;
}

const LABEL = 'mesh';
const HIGH_WATER = 1024 * 1024;
const TYPES = new Set<MeshMessage['type']>([
  'chat',
  'presence',
  'stats',
  'file-meta',
  'file-chunk',
  'file-end',
]);

function parse(data: unknown): MeshMessage | null {
  if (typeof data !== 'string') return null;

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;

  const { type } = value as { type?: unknown };
  return typeof type === 'string' && TYPES.has(type as MeshMessage['type'])
    ? (value as MeshMessage)
    : null;
}

export function createChannelLink(options: ChannelLinkOptions): ChannelLink {
  const { connection, initiator, onMessage, onOpen } = options;

  const queued: MeshMessage[] = [];
  let channel: RTCDataChannel | null = null;
  let closed = false;

  function attach(next: RTCDataChannel): void {
    channel = next;

    next.addEventListener('open', () => {
      if (closed) return;
      for (const message of queued) next.send(JSON.stringify(message));
      queued.length = 0;
      onOpen();
    });

    next.addEventListener('message', ({ data }) => {
      if (closed) return;
      const message = parse(data);
      if (message !== null) onMessage(message);
    });
  }

  if (initiator) attach(connection.createDataChannel(LABEL));
  else connection.addEventListener('datachannel', ({ channel: incoming }) => attach(incoming));

  function drain(open: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      open.bufferedAmountLowThreshold = HIGH_WATER / 2;
      open.addEventListener('bufferedamountlow', () => resolve(), { once: true });
    });
  }

  return {
    isOpen: () => !closed && channel?.readyState === 'open',
    send(message) {
      if (closed) return;
      if (channel?.readyState === 'open') channel.send(JSON.stringify(message));
      else queued.push(message);
    },

    // Attachments are thousands of messages, so they wait on the buffer rather than flooding it.
    async sendPaced(messages) {
      for (const message of messages) {
        if (closed) return;
        if (channel === null || channel.readyState !== 'open') {
          queued.push(message);
          continue;
        }
        if (channel.bufferedAmount > HIGH_WATER) await drain(channel);
        if (closed) return;
        channel.send(JSON.stringify(message));
      }
    },
    close() {
      closed = true;
      queued.length = 0;
      channel?.close();
    },
  };
}
