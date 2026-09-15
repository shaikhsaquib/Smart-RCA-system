import express from 'express';
import cors from 'cors';
import { ticketsRouter } from './routes/tickets';
import { reportsRouter } from './routes/reports';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/tickets', ticketsRouter);
  app.use('/api/reports', reportsRouter);

  return app;
}
