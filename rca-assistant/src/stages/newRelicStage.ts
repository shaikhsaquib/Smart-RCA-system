/**
 * STAGE 4: New Relic Log-Check
 *
 * Queries New Relic's NerdGraph API (GraphQL wrapper around NRQL) for
 * transaction errors in the relevant service, scoped to a time window derived
 * from the ticket's reported time (defaults to now, +/- 1 hour).
 */
import axios from 'axios';
import { env } from '../config/env';
import { RCATicketInput, StageResult } from '../types/rca';
import { completedResult, matchesAny, runStageSafely, ticketText } from './stageUtils';

const NERDGRAPH_URL = 'https://api.newrelic.com/graphql';
const WINDOW_MS = 60 * 60 * 1000; // +/- 1 hour around the reported time

interface ErrorRow {
  id?: string;
  'error.class'?: string;
  'error.message'?: string;
  count?: number;
}

function formatNrqlTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function buildTimeWindow(ticket: RCATicketInput): { since: string; until: string } {
  const center = ticket.reportedAt ? new Date(ticket.reportedAt) : new Date();
  return {
    since: formatNrqlTimestamp(new Date(center.getTime() - WINDOW_MS)),
    until: formatNrqlTimestamp(new Date(center.getTime() + WINDOW_MS)),
  };
}

async function runNrql(nrql: string): Promise<ErrorRow[]> {
  const query = `{
    actor {
      account(id: ${env.newRelic.accountId}) {
        nrql(query: "${nrql.replace(/"/g, '\\"')}") {
          results
        }
      }
    }
  }`;

  const { data } = await axios.post(
    NERDGRAPH_URL,
    { query },
    { headers: { 'API-Key': env.newRelic.apiKey as string, 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  if (data.errors) {
    throw new Error(`New Relic NerdGraph error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.actor.account.nrql.results as ErrorRow[];
}

async function runRealNewRelicCheck(ticket: RCATicketInput): Promise<StageResult> {
  const { since, until } = buildTimeWindow(ticket);
  const appName = env.newRelic.appName;

  const nrql = `SELECT count(*) FROM TransactionError WHERE appName = '${appName}' SINCE '${since}' UNTIL '${until}'`;
  const countResults = await runNrql(nrql);
  const errorCount = Number(countResults[0]?.count ?? 0);

  if (errorCount === 0) {
    return completedResult(
      'newRelic',
      false,
      '',
      `No TransactionErrors found for appName "${appName}" between ${since} and ${until}.`,
      'high',
      { nrql, since, until, errorCount }
    );
  }

  const detailNrql = `SELECT id, error.class, error.message FROM TransactionError WHERE appName = '${appName}' SINCE '${since}' UNTIL '${until}' LIMIT 5`;
  const details = await runNrql(detailNrql);

  return completedResult(
    'newRelic',
    true,
    `Found ${errorCount} transaction error(s) for "${appName}" in the reported time window: ${details
      .map((d) => d['error.class'])
      .filter(Boolean)
      .join(', ')}.`,
    `NRQL: ${detailNrql}`,
    'high',
    {
      countNrql: nrql,
      detailNrql,
      since,
      until,
      errorCount,
      traceIds: details.map((d) => d.id).filter(Boolean),
      sampleErrors: details,
    }
  );
}

const MOCK_NEWRELIC_PATTERNS = [/exception/i, /error trace/i, /latency/i, /500 error/i, /timeout/i, /failed transaction/i];

async function runMockNewRelicCheck(ticket: RCATicketInput): Promise<StageResult> {
  const found = matchesAny(ticketText(ticket), MOCK_NEWRELIC_PATTERNS);
  const { since, until } = buildTimeWindow(ticket);
  return completedResult(
    'newRelic',
    found,
    found ? '[MOCK] Ticket language suggests an application-level exception or latency issue.' : '',
    '[MOCK] No NEW_RELIC_API_KEY/ACCOUNT_ID configured - keyword heuristic used instead of a real NRQL query.',
    found ? 'medium' : 'low',
    { mode: 'mock', since, until, appName: env.newRelic.appName },
    true
  );
}

export async function checkNewRelicLogs(ticket: RCATicketInput): Promise<StageResult> {
  return runStageSafely('newRelic', async () => {
    if (!env.newRelic.apiKey || !env.newRelic.accountId) {
      return runMockNewRelicCheck(ticket);
    }
    return runRealNewRelicCheck(ticket);
  });
}
