import { connectMongoIfConfigured, requireMongoOrExit } from '../config/db';
import { env } from '../config/env';
import { syncTicketsFromJira } from '../services/ingestion';
import mongoose from 'mongoose';

async function main() {
  await connectMongoIfConfigured();
  requireMongoOrExit('sync-tickets');
  console.log(`Syncing tickets with JQL: ${env.jiraDefaultJql}`);
  const result = await syncTicketsFromJira(env.jiraDefaultJql);
  console.log('Sync complete:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
