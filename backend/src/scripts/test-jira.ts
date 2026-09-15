/**
 * No-Mongo Jira connectivity test. Fetches tickets matching a JQL and prints
 * them - nothing is written anywhere. Use this to confirm JIRA_BASE_URL /
 * JIRA_EMAIL / JIRA_API_TOKEN and your JQL are correct before setting up
 * MongoDB and running the real sync (npm run sync-tickets).
 *
 * Usage:
 *   npm run test:jira                          -> uses JIRA_DEFAULT_JQL from .env
 *   npm run test:jira -- "project = PLS ORDER BY updated DESC"
 */
import { env } from '../config/env';
import { JiraClient } from '../services/jiraClient';

async function main() {
  const jql = process.argv[2] || env.jiraDefaultJql;
  console.log(`[test-jira] Using JQL: ${jql}`);

  const jira = new JiraClient();
  const tickets = await jira.searchAll(jql);

  console.log(`[test-jira] Fetched ${tickets.length} ticket(s).`);
  console.log('[test-jira] First 10:');
  for (const t of tickets.slice(0, 10)) {
    console.log(`  ${t.key} [${t.status}] ${t.summary}`);
  }
}

main().catch((err) => {
  console.error('[test-jira] Failed:', err.message || err);
  process.exit(1);
});
