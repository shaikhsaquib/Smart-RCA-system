/**
 * Orchestrator Agent
 *
 * Runs the five diagnostic stage agents in the exact order a production support
 * engineer would work through them by hand, stopping as soon as one returns a
 * confident ("found: true") root cause - it does not run every stage on every
 * ticket. If every stage completes without finding anything, the ticket is
 * escalated to "Manual Investigation Required" rather than guessing.
 */
import { checkBuildPortalConfig } from '../stages/buildPortalStage';
import { checkMongoData } from '../stages/mongoStage';
import { checkCamundaLogs } from '../stages/camundaStage';
import { checkNewRelicLogs } from '../stages/newRelicStage';
import { debugCode } from '../stages/codeDebugStage';
import { logOrchestratorDecision, logStageResult, logStageStart } from '../logging/auditLog';
import {
  RCAEvidenceEntry,
  RCAReport,
  RCATicketInput,
  RecommendedOwner,
  RootCauseCategory,
  STAGE_LABELS,
  STAGE_ORDER,
  StageName,
  StageResult,
} from '../types/rca';

type StageRunner = (ticket: RCATicketInput) => Promise<StageResult>;

const STAGE_RUNNERS: Record<StageName, StageRunner> = {
  buildPortal: checkBuildPortalConfig,
  mongo: checkMongoData,
  camunda: checkCamundaLogs,
  newRelic: checkNewRelicLogs,
  codeDebug: debugCode,
};

/**
 * Maps the stage that found the issue to a root-cause category and the team that
 * should own the fix. "Configuration Issue -> TSO" is explicit in the source
 * process; the rest follow the same convention used by production support today
 * (no-code-change fixes go to TSO, anything needing a code change goes to
 * Engineering) - adjust here if your organization's ownership split differs.
 */
const STAGE_TO_CATEGORY: Record<StageName, RootCauseCategory> = {
  buildPortal: 'Configuration Issue',
  mongo: 'Data Issue',
  camunda: 'Workflow/Camunda Issue',
  newRelic: 'Application Error (New Relic)',
  codeDebug: 'Code Defect',
};

const STAGE_TO_OWNER: Record<StageName, RecommendedOwner> = {
  buildPortal: 'TSO',
  mongo: 'TSO',
  camunda: 'Engineering',
  newRelic: 'Engineering',
  codeDebug: 'Engineering',
};

export async function runRCAOrchestrator(ticket: RCATicketInput): Promise<RCAReport> {
  const stageResults: StageResult[] = [];
  const stagesRun: string[] = [];

  for (const stageName of STAGE_ORDER) {
    logStageStart(ticket, stageName);
    const result = await STAGE_RUNNERS[stageName](ticket);
    logStageResult(ticket, result);

    stageResults.push(result);
    stagesRun.push(STAGE_LABELS[stageName]);

    if (result.status === 'completed' && result.found) {
      logOrchestratorDecision(
        ticket.ticketId,
        `Root cause found at stage "${stageName}" - stopping before running later stages.`
      );
      return buildReport(ticket, stageName, result, stageResults, stagesRun);
    }
  }

  logOrchestratorDecision(
    ticket.ticketId,
    'All stages completed without a confident root cause - escalating to Manual Investigation Required.'
  );
  return buildManualEscalationReport(ticket, stageResults, stagesRun);
}

function buildReport(
  ticket: RCATicketInput,
  stageName: StageName,
  result: StageResult,
  stageResults: StageResult[],
  stagesRun: string[]
): RCAReport {
  return {
    ticketId: ticket.ticketId,
    rootCauseCategory: STAGE_TO_CATEGORY[stageName],
    rootCauseSummary: result.issue,
    evidence: buildEvidenceTrail(stageResults),
    recommendedOwner: STAGE_TO_OWNER[stageName],
    stagesRun,
    confidence: result.confidence,
    stageResults,
  };
}

function buildManualEscalationReport(
  ticket: RCATicketInput,
  stageResults: StageResult[],
  stagesRun: string[]
): RCAReport {
  const skippedStages = stageResults.filter((r) => r.status === 'skipped').map((r) => STAGE_LABELS[r.stage]);
  const skippedNote =
    skippedStages.length > 0
      ? ` Note: ${skippedStages.join(', ')} could not be checked (data source unavailable) - re-run once reachable.`
      : '';

  return {
    ticketId: ticket.ticketId,
    rootCauseCategory: 'Manual Investigation Required',
    rootCauseSummary: `No automated stage (Build Portal, MongoDB, Camunda, New Relic, or codebase search) found a confident root cause.${skippedNote}`,
    evidence: buildEvidenceTrail(stageResults),
    recommendedOwner: 'Needs Manual Triage',
    stagesRun,
    confidence: 'low',
    stageResults,
  };
}

function buildEvidenceTrail(stageResults: StageResult[]): RCAEvidenceEntry[] {
  return stageResults.map((result) => ({
    stage: STAGE_LABELS[result.stage],
    detail:
      result.status === 'skipped'
        ? `Skipped - ${result.skipReason}`
        : result.found
          ? result.issue
          : `No issue found. ${result.evidence}`,
  }));
}
