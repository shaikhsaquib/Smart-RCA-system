/**
 * CLI entry point to run a single diagnostic stage in isolation, for testing one
 * integration at a time without going through the full orchestrator.
 *
 * Usage:
 *   npm run stage:mongo -- dataIssue           -> run one named fixture
 *   npm run stage:camunda -- path/to/ticket.json
 *   npm run stage:build-portal                 -> defaults to the configIssue fixture
 */
import fs from 'fs';
import { checkBuildPortalConfig } from '../stages/buildPortalStage';
import { checkMongoData } from '../stages/mongoStage';
import { checkCamundaLogs } from '../stages/camundaStage';
import { checkNewRelicLogs } from '../stages/newRelicStage';
import { debugCode } from '../stages/codeDebugStage';
import { SAMPLE_TICKETS } from '../fixtures/sample-tickets';
import { RCATicketInput, StageName } from '../types/rca';

const STAGE_RUNNERS: Record<StageName, (ticket: RCATicketInput) => Promise<unknown>> = {
  buildPortal: checkBuildPortalConfig,
  mongo: checkMongoData,
  camunda: checkCamundaLogs,
  newRelic: checkNewRelicLogs,
  codeDebug: debugCode,
};

async function main() {
  const stageName = process.argv[2] as StageName;
  const ticketArg = process.argv[3];

  if (!stageName || !STAGE_RUNNERS[stageName]) {
    console.error(`Usage: run-stage.ts <${Object.keys(STAGE_RUNNERS).join('|')}> [fixtureName|path/to/ticket.json]`);
    process.exit(1);
  }

  let ticket: RCATicketInput;
  if (!ticketArg) {
    ticket = Object.values(SAMPLE_TICKETS)[0];
  } else if (SAMPLE_TICKETS[ticketArg]) {
    ticket = SAMPLE_TICKETS[ticketArg];
  } else if (fs.existsSync(ticketArg)) {
    ticket = JSON.parse(fs.readFileSync(ticketArg, 'utf-8'));
  } else {
    console.error(`Unknown fixture or file: "${ticketArg}". Available fixtures: ${Object.keys(SAMPLE_TICKETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Running stage "${stageName}" for ticket ${ticket.ticketId}...\n`);
  const result = await STAGE_RUNNERS[stageName](ticket);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Stage run failed:', err);
  process.exit(1);
});
