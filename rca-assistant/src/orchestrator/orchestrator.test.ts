import { checkBuildPortalConfig } from '../stages/buildPortalStage';
import { checkMongoData } from '../stages/mongoStage';
import { checkCamundaLogs } from '../stages/camundaStage';
import { checkNewRelicLogs } from '../stages/newRelicStage';
import { debugCode } from '../stages/codeDebugStage';
import { StageResult } from '../types/rca';

jest.mock('../stages/buildPortalStage');
jest.mock('../stages/mongoStage');
jest.mock('../stages/camundaStage');
jest.mock('../stages/newRelicStage');
jest.mock('../stages/codeDebugStage');

import { runRCAOrchestrator } from './orchestrator';

const mockBuildPortal = checkBuildPortalConfig as jest.Mock;
const mockMongo = checkMongoData as jest.Mock;
const mockCamunda = checkCamundaLogs as jest.Mock;
const mockNewRelic = checkNewRelicLogs as jest.Mock;
const mockCodeDebug = debugCode as jest.Mock;

const TICKET = {
  ticketId: 'SUPPORT-9999',
  summary: 'Test ticket',
  description: 'Test description',
  supplierId: 'SUP-9999',
};

function notFound(stage: StageResult['stage']): StageResult {
  return {
    stage,
    status: 'completed',
    found: false,
    issue: '',
    evidence: 'nothing here',
    confidence: 'high',
    details: {},
    mocked: false,
  };
}

function found(stage: StageResult['stage'], confidence: StageResult['confidence'] = 'high'): StageResult {
  return {
    stage,
    status: 'completed',
    found: true,
    issue: `Root cause found at ${stage}`,
    evidence: `evidence for ${stage}`,
    confidence,
    details: { some: 'detail' },
    mocked: false,
  };
}

function skipped(stage: StageResult['stage'], reason: string): StageResult {
  return {
    stage,
    status: 'skipped',
    skipReason: reason,
    found: false,
    issue: '',
    evidence: '',
    confidence: 'low',
    details: {},
    mocked: false,
  };
}

let consoleLogSpy: jest.SpyInstance;

beforeAll(() => {
  // The orchestrator logs every stage's query/result for auditability (by design) -
  // silence it here so test output stays readable.
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterAll(() => {
  consoleLogSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runRCAOrchestrator - short-circuit control flow', () => {
  it('stops at the first stage that finds a root cause and never calls later stages', async () => {
    mockBuildPortal.mockResolvedValue(notFound('buildPortal'));
    mockMongo.mockResolvedValue(found('mongo'));
    mockCamunda.mockResolvedValue(found('camunda')); // should never be reached

    const report = await runRCAOrchestrator(TICKET);

    expect(report.rootCauseCategory).toBe('Data Issue');
    expect(report.recommendedOwner).toBe('TSO');
    expect(report.stagesRun).toEqual(['Build Portal Config-Check', 'MongoDB Data-Check']);
    expect(mockCamunda).not.toHaveBeenCalled();
    expect(mockNewRelic).not.toHaveBeenCalled();
    expect(mockCodeDebug).not.toHaveBeenCalled();
  });

  it('stops immediately at stage 1 (Build Portal) when it finds the issue', async () => {
    mockBuildPortal.mockResolvedValue(found('buildPortal', 'high'));

    const report = await runRCAOrchestrator(TICKET);

    expect(report.rootCauseCategory).toBe('Configuration Issue');
    expect(report.recommendedOwner).toBe('TSO');
    expect(report.confidence).toBe('high');
    expect(report.stagesRun).toEqual(['Build Portal Config-Check']);
    expect(mockMongo).not.toHaveBeenCalled();
  });

  it('runs all 5 stages and escalates to Manual Investigation Required when none find anything', async () => {
    mockBuildPortal.mockResolvedValue(notFound('buildPortal'));
    mockMongo.mockResolvedValue(notFound('mongo'));
    mockCamunda.mockResolvedValue(notFound('camunda'));
    mockNewRelic.mockResolvedValue(notFound('newRelic'));
    mockCodeDebug.mockResolvedValue(notFound('codeDebug'));

    const report = await runRCAOrchestrator(TICKET);

    expect(report.rootCauseCategory).toBe('Manual Investigation Required');
    expect(report.recommendedOwner).toBe('Needs Manual Triage');
    expect(report.confidence).toBe('low');
    expect(report.stagesRun).toHaveLength(5);
    expect(mockCodeDebug).toHaveBeenCalledTimes(1);
  });

  it('treats a skipped (unavailable) stage as inconclusive and continues to the next stage', async () => {
    mockBuildPortal.mockResolvedValue(notFound('buildPortal'));
    mockMongo.mockResolvedValue(skipped('mongo', 'unavailable: connection timed out'));
    mockCamunda.mockResolvedValue(found('camunda'));

    const report = await runRCAOrchestrator(TICKET);

    expect(report.rootCauseCategory).toBe('Workflow/Camunda Issue');
    expect(mockCamunda).toHaveBeenCalledTimes(1);
    expect(report.evidence).toContainEqual({
      stage: 'MongoDB Data-Check',
      detail: 'Skipped - unavailable: connection timed out',
    });
  });

  it('includes every executed stage (found and not-found) in the evidence trail for auditability', async () => {
    mockBuildPortal.mockResolvedValue(notFound('buildPortal'));
    mockMongo.mockResolvedValue(found('mongo'));

    const report = await runRCAOrchestrator(TICKET);

    expect(report.evidence).toEqual([
      { stage: 'Build Portal Config-Check', detail: 'No issue found. nothing here' },
      { stage: 'MongoDB Data-Check', detail: 'Root cause found at mongo' },
    ]);
  });

  it('carries the ticketId through into the final report', async () => {
    mockBuildPortal.mockResolvedValue(found('buildPortal'));
    const report = await runRCAOrchestrator(TICKET);
    expect(report.ticketId).toBe('SUPPORT-9999');
  });
});
