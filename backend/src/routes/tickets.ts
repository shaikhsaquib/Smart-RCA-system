import { Router } from 'express';
import { env } from '../config/env';
import { syncTicketsFromJira } from '../services/ingestion';
import { categorizeUncategorizedTickets } from '../services/categorization';
import { Ticket } from '../models/Ticket';
import { requireMongo } from '../middleware/requireMongo';

export const ticketsRouter = Router();
ticketsRouter.use(requireMongo);

// POST /api/tickets/sync - FSD 5.1
ticketsRouter.post('/sync', async (req, res) => {
  try {
    const jql = req.body?.jql || env.jiraDefaultJql;
    const maxResults = req.body?.maxResults || 100;
    const result = await syncTicketsFromJira(jql, maxResults);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Jira sync failed' });
  }
});

// POST /api/tickets/categorize - FSD 5.2
ticketsRouter.post('/categorize', async (_req, res) => {
  try {
    const result = await categorizeUncategorizedTickets();
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Categorization failed' });
  }
});

// GET /api/tickets - FSD 5.4
ticketsRouter.get('/', async (req, res) => {
  const { category, priority, confidence, from, to } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (confidence) filter.confidence = confidence;
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    };
  }

  const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  res.json(tickets);
});
