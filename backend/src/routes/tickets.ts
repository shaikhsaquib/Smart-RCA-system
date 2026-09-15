import { Router } from 'express';
import { env } from '../config/env';
import { syncTicketsFromJira } from '../services/ingestion';
import { categorizeUncategorizedTickets } from '../services/categorization';
import { Ticket } from '../models/Ticket';
import { JiraClient } from '../services/jiraClient';
import { requireMongo } from '../middleware/requireMongo';

export const ticketsRouter = Router();

// POST /api/tickets/jira-test - no-Mongo connectivity check. Registered before the
// requireMongo guard below so it works even without MONGODB_URI configured: fetches
// from Jira and returns the tickets directly, nothing is written anywhere.
ticketsRouter.post('/jira-test', async (req, res) => {
  try {
    const jira = new JiraClient();
    const jql = req.body?.jql || env.jiraDefaultJql;
    const tickets = await jira.searchAll(jql);
    res.json({ jql, ticketsFetched: tickets.length, tickets: tickets.slice(0, 20) });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Jira connectivity test failed' });
  }
});

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
