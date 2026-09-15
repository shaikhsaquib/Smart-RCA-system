import { ConfidenceLevel, RCATicketInput, StageName, StageResult } from '../types/rca';

/**
 * Wraps a stage's real diagnostic logic so a failure at any data source
 * (timeout, auth failure, DNS error, etc.) is recorded as "skipped - unavailable"
 * instead of crashing the whole orchestrator run (non-functional requirement).
 */
export async function runStageSafely(
  stage: StageName,
  fn: () => Promise<StageResult>
): Promise<StageResult> {
  try {
    return await fn();
  } catch (err: any) {
    return {
      stage,
      status: 'skipped',
      skipReason: `unavailable: ${err?.message || String(err)}`,
      found: false,
      issue: '',
      evidence: '',
      confidence: 'low',
      details: { error: err?.message || String(err) },
      mocked: false,
    };
  }
}

export function completedResult(
  stage: StageName,
  found: boolean,
  issue: string,
  evidence: string,
  confidence: ConfidenceLevel,
  details: Record<string, unknown>,
  mocked = false
): StageResult {
  return { stage, status: 'completed', found, issue, evidence, confidence, details, mocked };
}

/** Combined haystack of ticket text used by every stage's keyword heuristics (mock mode + real triage hints). */
export function ticketText(ticket: RCATicketInput): string {
  return `${ticket.summary} ${ticket.description}`.toLowerCase();
}

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}
