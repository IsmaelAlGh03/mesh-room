import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './env';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.clientOrigins }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
