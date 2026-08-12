import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer, type RunningServer } from '../index';
import { MAX_ROOM_SIZE, type Participant } from '../rooms';

let server: RunningServer;
let clients: Socket[] = [];

function once<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function silence(socket: Socket, event: string, windowMs = 250): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, windowMs);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      reject(new Error(`unexpected "${event}": ${JSON.stringify(payload)}`));
    });
  });
}

async function connect(): Promise<Socket> {
  const client = ioClient(`http://localhost:${server.port}`, { transports: ['websocket'] });
  clients.push(client);
  await once(client, 'connect');
  return client;
}

async function join(
  client: Socket,
  roomId: string,
  displayName: string,
): Promise<Participant[]> {
  const peers = once<Participant[]>(client, 'existing-peers');
  client.emit('join-room', { roomId, displayName });
  return peers;
}

beforeEach(async () => {
  server = await startServer(0);
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  await server.close();
});

describe('signaling', () => {
  it('answers the first join with an empty peer list', async () => {
    const client = await connect();

    expect(await join(client, 'alpha', 'Ada')).toEqual([]);
  });

  it('tells a joiner who is already in the room', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');

    const second = await connect();
    const peers = await join(second, 'alpha', 'Bo');

    expect(peers).toEqual([{ socketId: first.id, displayName: 'Ada' }]);
  });

  it('announces a newcomer to the existing members', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');

    const announced = once<Participant>(first, 'peer-joined');
    const second = await connect();
    await join(second, 'alpha', 'Bo');

    expect(await announced).toEqual({ socketId: second.id, displayName: 'Bo' });
  });

  it('does not announce a newcomer to a different room', async () => {
    const outsider = await connect();
    await join(outsider, 'beta', 'Cy');

    const quiet = silence(outsider, 'peer-joined');
    const joiner = await connect();
    await join(joiner, 'alpha', 'Ada');

    await quiet;
  });

  it('relays a signal to the addressed peer', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');
    const second = await connect();
    await join(second, 'alpha', 'Bo');

    const delivered = once<{ from: string; data: unknown }>(second, 'signal');
    first.emit('signal', { to: second.id, data: { type: 'offer', sdp: 'v=0' } });

    expect(await delivered).toEqual({
      from: first.id,
      data: { type: 'offer', sdp: 'v=0' },
    });
  });

  it('does not relay a signal to anyone else in the room', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');
    const second = await connect();
    await join(second, 'alpha', 'Bo');
    const third = await connect();
    await join(third, 'alpha', 'Cy');

    const quiet = silence(third, 'signal');
    first.emit('signal', { to: second.id, data: { candidate: 'x' } });

    await quiet;
  });

  it('tells the room when someone disconnects', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');
    const second = await connect();
    await join(second, 'alpha', 'Bo');

    const departingId = second.id;
    const left = once<{ socketId: string }>(first, 'peer-left');
    second.disconnect();

    expect(await left).toEqual({ socketId: departingId });
  });

  it('accepts the sixth participant and refuses the seventh', async () => {
    for (let i = 0; i < MAX_ROOM_SIZE - 1; i += 1) {
      const filler = await connect();
      await join(filler, 'alpha', `Peer ${i}`);
    }

    const sixth = await connect();
    expect(await join(sixth, 'alpha', 'Sixth')).toHaveLength(MAX_ROOM_SIZE - 1);

    const seventh = await connect();
    const refused = once<void>(seventh, 'room-full');
    const quiet = silence(seventh, 'existing-peers');
    seventh.emit('join-room', { roomId: 'alpha', displayName: 'Seventh' });

    await refused;
    await quiet;
  });

  it('frees a slot when a member leaves a full room', async () => {
    const members: Socket[] = [];
    for (let i = 0; i < MAX_ROOM_SIZE; i += 1) {
      const filler = await connect();
      await join(filler, 'alpha', `Peer ${i}`);
      members.push(filler);
    }

    members[0].disconnect();
    await once(members[1], 'peer-left');

    const late = await connect();
    expect(await join(late, 'alpha', 'Late')).toHaveLength(MAX_ROOM_SIZE - 1);
  });

  it('starts a fresh room once everyone has left', async () => {
    const first = await connect();
    await join(first, 'alpha', 'Ada');
    first.disconnect();

    const next = await connect();
    expect(await join(next, 'alpha', 'Bo')).toEqual([]);
  });

  it('normalises the display name before anyone sees it', async () => {
    const first = await connect();
    await join(first, 'alpha', '   ');

    const second = await connect();
    const peers = await join(second, 'alpha', 'Bo');

    expect(peers).toEqual([{ socketId: first.id, displayName: 'Guest' }]);
  });
});
