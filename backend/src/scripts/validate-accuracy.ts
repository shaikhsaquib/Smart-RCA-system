/**
 * Compares stored categorization results against a manually labeled sample
 * to measure accuracy against the >=85% target (FSD section 9, BRD section 10).
 *
 * Usage: npm run validate-accuracy -- path/to/labels.csv
 * CSV format: key,expectedCategory
 *   SUPPORT-1234,Data Correction
 *   SUPPORT-1240,Integration Failure
 */
import fs from 'fs';
import { connectMongoIfConfigured, requireMongoOrExit } from '../config/db';
import { Ticket } from '../models/Ticket';
import mongoose from 'mongoose';

interface Label {
  key: string;
  expectedCategory: string;
}

function parseCsv(filePath: string): Label[] {
  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const [header, ...rows] = lines;
  const cols = header.split(',').map((c) => c.trim().toLowerCase());
  const keyIdx = cols.indexOf('key');
  const categoryIdx = cols.indexOf('expectedcategory');

  if (keyIdx === -1 || categoryIdx === -1) {
    throw new Error('CSV must have "key" and "expectedCategory" columns');
  }

  return rows.map((row) => {
    const parts = row.split(',');
    return { key: parts[keyIdx].trim(), expectedCategory: parts[categoryIdx].trim() };
  });
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npm run validate-accuracy -- path/to/labels.csv');
    process.exit(1);
  }

  const labels = parseCsv(csvPath);
  await connectMongoIfConfigured();
  requireMongoOrExit('validate-accuracy');

  let correct = 0;
  const mismatches: { key: string; expected: string; actual: string | null }[] = [];

  for (const label of labels) {
    const ticket = await Ticket.findOne({ key: label.key }).lean();
    const actual = ticket?.category ?? null;

    if (actual === label.expectedCategory) {
      correct += 1;
    } else {
      mismatches.push({ key: label.key, expected: label.expectedCategory, actual });
    }
  }

  const accuracy = labels.length > 0 ? correct / labels.length : 0;

  console.log(`Sample size: ${labels.length}`);
  console.log(`Correct: ${correct}`);
  console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (target: >=85%)`);

  if (mismatches.length > 0) {
    console.log('\nMismatches:');
    for (const m of mismatches) {
      console.log(`  ${m.key}: expected "${m.expected}", got "${m.actual}"`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
