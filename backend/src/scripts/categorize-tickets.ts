import { connectMongoIfConfigured, requireMongoOrExit } from '../config/db';
import { categorizeUncategorizedTickets } from '../services/categorization';
import mongoose from 'mongoose';

async function main() {
  await connectMongoIfConfigured();
  requireMongoOrExit('categorize-tickets');
  const result = await categorizeUncategorizedTickets();
  console.log('Categorization complete:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Categorization failed:', err);
  process.exit(1);
});
