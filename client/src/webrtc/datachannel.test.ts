import { describe, expect, it, vi } from 'vitest';
import { createChannelLink } from './datachannel';
import type { MeshMessage } from '../types';

type Handler = (event: never) => void;

function createStubChannel() {
  const listeners = new Map<string, Set<Handler>>();

  const channel = {
    readyState: 'connecting' as RTCDataChannelState,
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(event: string, handler: Handler) {
      const existing = listeners.get(event) ?? new Set<Handler>();
      existing.add(handler);
      listeners.set(event, existing);
    },
    fire(event: string, payload: unknown) {
      for (const handler of listeners.get(event) ?? []) {
        (handler as (value: unknown) => void)(payload);
      }
    },
    open() {
      channel.readyState = 'open';
      channel.fire('open', {});
    },
    deliver(data: unknown) {
      channel.fire('message', { data });
    },
  };

  return channel;
}

function createStubConnection(channel: ReturnType<typeof createStubChannel>) {
  const listeners = new Map<string, Set<Handler>>();

  return {
    createDataChannel: vi.fn(() => channel),
    addEventListener(event: string, handler: Handler) {
      const existing = listeners.get(event) ?? new Set<Handler>();
      existing.add(handler);
      listeners.set(event, existing);
    },
    announceChannel() {
      for (const handler of listeners.get('datachannel') ?? []) {
        (handler as (value: unknown) => void)({ channel });
      }
    },
  };
}

function setup(initiator = true) {
  const channel = createStubChannel();
  const connection = createStubConnection(channel);
  const received: MeshMessage[] = [];
  const onOpen = vi.fn();

  const link = createChannelLink({
    connection: connection as unknown as RTCPeerConnection,
    initiator,
    onMessage: (message) => received.push(message),
    onOpen,
  });

  return { channel, connection, link, received, onOpen };
}

const chat = (text: string): MeshMessage => ({ type: 'chat', id: text, text, at: 0 });

describe('createChannelLink', () => {
  it('queues messages sent before the channel opens, then flushes them in order', () => {
    const { channel, link } = setup();

    link.send(chat('first'));
    link.send(chat('second'));
    expect(channel.send).not.toHaveBeenCalled();

    channel.open();

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.send.mock.calls[0]?.[0]).toBe(JSON.stringify(chat('first')));
    expect(channel.send.mock.calls[1]?.[0]).toBe(JSON.stringify(chat('second')));
  });

  it('announces the open channel only after the queue is flushed', () => {
    const { channel, link, onOpen } = setup();
    const sendOrder: string[] = [];

    channel.send.mockImplementation(() => sendOrder.push('send'));
    onOpen.mockImplementation(() => sendOrder.push('open'));

    link.send(chat('queued'));
    channel.open();

    expect(sendOrder).toEqual(['send', 'open']);
  });

  it('sends straight through once open', () => {
    const { channel, link } = setup();

    channel.open();
    link.send(chat('live'));

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(link.isOpen()).toBe(true);
  });

  it('delivers well-formed messages of every known type', () => {
    const { channel, received } = setup();

    channel.deliver(JSON.stringify({ type: 'chat', id: 'a', text: 'hello', at: 1 }));
    channel.deliver(JSON.stringify({ type: 'presence', micOn: false, cameraOn: true }));
    channel.deliver(JSON.stringify({ type: 'stats', at: 2, links: [] }));

    expect(received.map((message) => message.type)).toEqual(['chat', 'presence', 'stats']);
  });

  it('drops malformed and unknown messages instead of throwing', () => {
    const { channel, received } = setup();

    channel.deliver('not json at all');
    channel.deliver(JSON.stringify({ type: 'reaction', emoji: 'from a newer peer' }));
    channel.deliver(JSON.stringify(['unexpected shape']));
    channel.deliver(JSON.stringify(null));
    channel.deliver(new ArrayBuffer(8));
    channel.deliver(JSON.stringify(chat('survivor')));

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('chat');
  });

  it('attaches to the channel the initiator created when it is not the initiator', () => {
    const { channel, connection, link, received } = setup(false);

    expect(connection.createDataChannel).not.toHaveBeenCalled();

    connection.announceChannel();
    channel.deliver(JSON.stringify(chat('inbound')));
    expect(received).toHaveLength(1);

    link.send(chat('outbound'));
    channel.open();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('waits for the buffer to drain before sending the rest of an attachment', async () => {
    const { channel, link } = setup();
    channel.open();
    channel.bufferedAmount = 2 * 1024 * 1024;

    const pieces: MeshMessage[] = [
      { type: 'file-chunk', id: 'a', index: 0, data: 'aaa' },
      { type: 'file-chunk', id: 'a', index: 1, data: 'bbb' },
    ];
    const sending = link.sendPaced(pieces);

    // A buffer already over the mark holds even the first chunk back.
    await Promise.resolve();
    expect(channel.send).not.toHaveBeenCalled();

    channel.bufferedAmount = 0;
    channel.fire('bufferedamountlow', {});
    await sending;

    expect(channel.send).toHaveBeenCalledTimes(2);
  });

  it('sends an attachment straight through when the buffer is empty', async () => {
    const { channel, link } = setup();
    channel.open();

    await link.sendPaced([
      { type: 'file-chunk', id: 'a', index: 0, data: 'aaa' },
      { type: 'file-chunk', id: 'a', index: 1, data: 'bbb' },
    ]);

    expect(channel.send).toHaveBeenCalledTimes(2);
  });

  it('stops sending and delivering once closed', () => {
    const { channel, link, received } = setup();

    link.send(chat('never sent'));
    link.close();
    channel.open();

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(channel.send).not.toHaveBeenCalled();

    channel.deliver(JSON.stringify(chat('after close')));
    expect(received).toHaveLength(0);
    expect(link.isOpen()).toBe(false);
  });
});
