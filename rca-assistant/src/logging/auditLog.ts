import { RCATicketInput, StageResult } from '../types/rca';

/**
 * Structured, timestamped logging of every stage's query/result so a human can
 * verify an RCA report after the fact (non-functional requirement: auditability).
 * Logs to stdout as JSON lines; swap this for a real log sink (file/ELK/etc.)
 * without touching stage or orchestrator code.
 */
export function logStageStart(ticket: RCATicketInput, stage: string): void {
  emit('stage_start', { ticketId: ticket.ticketId, stage });
}

export function logStageResult(ticket: RCATicketInput, result: StageResult): void {
  emit('stage_result', {
    ticketId: ticket.ticketId,
    stage: result.stage,
    status: result.status,
    found: result.found,
    confidence: result.confidence,
    mocked: result.mocked,
    issue: result.issue,
    evidence: result.evidence,
    details: result.details,
  });
}

export function logOrchestratorDecision(ticketId: string, message: string): void {
  emit('orchestrator', { ticketId, message });
}

function emit(kind: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ kind, timestamp: new Date().toISOString(), ...payload }));
}
