import { createServer, type Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { createApp } from './app';
import { env } from './env';

export interface RunningServer {
  http: HttpServer;
  io: IOServer;
  port: number;
  close: () => Promise<void>;
}

export async function startServer(port: number = env.port): Promise<RunningServer> {
  const http = createServer(createApp());
  const io = new IOServer(http, {
    cors: { origin: env.clientOrigins },
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));

  const address = http.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Server did not bind to a TCP port');
  }

  return {
    http,
    io,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      });
      if (http.listening) {
        await new Promise<void>((resolve, reject) => {
          http.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  };
}

if (require.main === module) {
  startServer().then(({ port }) => {
    console.log(`mesh-room signaling server listening on :${port}`);
  });
}
