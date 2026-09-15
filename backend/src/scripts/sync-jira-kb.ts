import mongoose from 'mongoose';
import { connectMongoIfConfigured, isMongoConnected } from '../config/db';
import { syncJiraKnowledgeBase } from '../services/jiraSync';

async function main() {
  await connectMongoIfConfigured();

  if (!isMongoConnected()) {
    console.error(
      '[sync-jira-kb] MongoDB is not configured or unavailable. Set MONGODB_URI in your .env and try again.'
    );
    process.exit(1);
  }

  try {
    const result = await syncJiraKnowledgeBase();
    console.log('[sync-jira-kb] Sync complete:', result);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[sync-jira-kb] Sync failed:', err.message || err);
  process.exit(1);
});
