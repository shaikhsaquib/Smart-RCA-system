/** Ticket/query handed to the orchestrator - mirrors what a support engineer starts from. */
export interface RCATicketInput {
  ticketId: string;
  summary: string;
  description: string;
  supplierId?: string;
  /** ISO 8601 timestamp. Used to scope the New Relic time window. Defaults to "now" if omitted. */
  reportedAt?: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type StageName =
  | 'buildPortal'
  | 'mongo'
  | 'camunda'
  | 'newRelic'
  | 'codeDebug';

export const STAGE_ORDER: StageName[] = ['buildPortal', 'mongo', 'camunda', 'newRelic', 'codeDebug'];

export const STAGE_LABELS: Record<StageName, string> = {
  buildPortal: 'Build Portal Config-Check',
  mongo: 'MongoDB Data-Check',
  camunda: 'Camunda Log-Check',
  newRelic: 'New Relic Log-Check',
  codeDebug: 'Code-Debug',
};

/**
 * Result contract every diagnostic stage agent returns, per the spec's
 * `{ found, issue, evidence, confidence }` shape, extended with the
 * execution metadata the orchestrator and audit log need.
 */
export interface StageResult {
  stage: StageName;
  /** "completed" ran to a real conclusion (found or not); "skipped" means the
   *  data source was unreachable/unconfigured and no conclusion could be drawn. */
  status: 'completed' | 'skipped';
  skipReason?: string;
  found: boolean;
  issue: string;
  evidence: string;
  confidence: ConfidenceLevel;
  /** Stage-specific audit trail: raw query/result, process/incident IDs, NRQL + trace
   *  IDs, file/line references, etc. Always populated for human verification. */
  details: Record<string, unknown>;
  /** True when this result came from mock mode because the stage wasn't configured
   *  with real credentials yet (see each stage file for what mock mode means there). */
  mocked: boolean;
}

export type RootCauseCategory =
  | 'Configuration Issue'
  | 'Data Issue'
  | 'Workflow/Camunda Issue'
  | 'Application Error (New Relic)'
  | 'Code Defect'
  | 'Manual Investigation Required';

export type RecommendedOwner = 'TSO' | 'Engineering' | 'Needs Manual Triage';

export interface RCAEvidenceEntry {
  stage: string;
  detail: string;
}

/** Final report shape produced by the Orchestrator - matches the required output schema. */
export interface RCAReport {
  ticketId: string;
  rootCauseCategory: RootCauseCategory;
  rootCauseSummary: string;
  evidence: RCAEvidenceEntry[];
  recommendedOwner: RecommendedOwner;
  stagesRun: string[];
  confidence: ConfidenceLevel;
  /** Full per-stage results (including skipped stages), for auditability beyond
   *  the required schema. Not part of the contractual output but always attached. */
  stageResults: StageResult[];
}
