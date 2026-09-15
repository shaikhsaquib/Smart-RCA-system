import { connectDb } from '../config/db';
import { categorizeUncategorizedTickets } from '../services/categorization';
import mongoose from 'mongoose';

async function main() {
  await connectDb();
  const result = await categorizeUncategorizedTickets();
  console.log('Categorization complete:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Categorization failed:', err);
  process.exit(1);
});
