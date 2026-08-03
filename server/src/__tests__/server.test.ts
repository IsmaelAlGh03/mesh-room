import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer, type RunningServer } from '../index';

describe('server harness', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer(0);
  });

  afterAll(async () => {
    await server.close();
  });

  it('binds to an ephemeral port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('serves the health check used for Render cold-start detection', async () => {
    const response = await fetch(`http://localhost:${server.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('accepts a real client socket connection', async () => {
    const client: Socket = ioClient(`http://localhost:${server.port}`, {
      transports: ['websocket'],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', reject);
      });

      expect(client.connected).toBe(true);
    } finally {
      client.disconnect();
    }
  });
});
