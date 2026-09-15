/**
 * CLI entry point to run the full orchestrator against a fake ticket.
 *
 * Usage:
 *   npm run rca                          -> runs the default sample ticket
 *   npm run rca -- configIssue           -> runs one named fixture (see fixtures/sample-tickets.ts)
 *   npm run rca -- path/to/ticket.json   -> runs a ticket loaded from a JSON file
 *   npm run rca:all-fixtures             -> runs every fixture and prints a summary table
 */
import fs from 'fs';
import { runRCAOrchestrator } from '../orchestrator/orchestrator';
import { SAMPLE_TICKETS } from '../fixtures/sample-tickets';
import { RCATicketInput } from '../types/rca';

async function runAllFixtures() {
  for (const [name, ticket] of Object.entries(SAMPLE_TICKETS)) {
    console.log(`\n=== Fixture: ${name} (${ticket.ticketId}) ===`);
    const report = await runRCAOrchestrator(ticket);
    console.log(
      `-> ${report.rootCauseCategory} | owner: ${report.recommendedOwner} | confidence: ${report.confidence} | stages run: ${report.stagesRun.length}`
    );
    console.log(`   ${report.rootCauseSummary}`);
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--all-fixtures') {
    await runAllFixtures();
    return;
  }

  let ticket: RCATicketInput;
  if (!arg) {
    ticket = SAMPLE_TICKETS.configIssue;
  } else if (SAMPLE_TICKETS[arg]) {
    ticket = SAMPLE_TICKETS[arg];
  } else if (fs.existsSync(arg)) {
    ticket = JSON.parse(fs.readFileSync(arg, 'utf-8'));
  } else {
    console.error(`Unknown fixture or file: "${arg}". Available fixtures: ${Object.keys(SAMPLE_TICKETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Running RCA orchestrator for ticket ${ticket.ticketId}...\n`);
  const report = await runRCAOrchestrator(ticket);

  console.log('\n=== Final RCA Report ===');
  console.log(
    JSON.stringify(
      {
        ticketId: report.ticketId,
        rootCauseCategory: report.rootCauseCategory,
        rootCauseSummary: report.rootCauseSummary,
        evidence: report.evidence,
        recommendedOwner: report.recommendedOwner,
        stagesRun: report.stagesRun,
        confidence: report.confidence,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('RCA run failed:', err);
  process.exit(1);
});
