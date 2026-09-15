import { JiraClient } from './jiraClient';
import { Ticket } from '../models/Ticket';

export interface SyncResult {
  ticketsFetched: number;
  ticketsNew: number;
  ticketsUpdated: number;
}

export async function syncTicketsFromJira(jql: string, maxResults = 100): Promise<SyncResult> {
  const jira = new JiraClient();
  const tickets = await jira.searchAll(jql, maxResults);

  let ticketsNew = 0;
  let ticketsUpdated = 0;

  for (const ticket of tickets) {
    const existing = await Ticket.findOne({ key: ticket.key }).select('_id').lean();

    await Ticket.updateOne(
      { key: ticket.key },
      {
        $set: {
          summary: ticket.summary,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          reporter: ticket.reporter,
          createdAt: ticket.createdAt,
          resolvedAt: ticket.resolvedAt,
          labels: ticket.labels,
        },
      },
      { upsert: true }
    );

    if (existing) {
      ticketsUpdated += 1;
    } else {
      ticketsNew += 1;
    }
  }

  return {
    ticketsFetched: tickets.length,
    ticketsNew,
    ticketsUpdated,
  };
}
