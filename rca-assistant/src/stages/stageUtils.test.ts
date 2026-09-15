import { matchesAny, runStageSafely, ticketText } from './stageUtils';
import { RCATicketInput } from '../types/rca';

describe('runStageSafely', () => {
  it('returns the stage function result unchanged on success', async () => {
    const result = await runStageSafely('mongo', async () => ({
      stage: 'mongo' as const,
      status: 'completed' as const,
      found: true,
      issue: 'ok',
      evidence: 'ok',
      confidence: 'high' as const,
      details: {},
      mocked: false,
    }));
    expect(result.status).toBe('completed');
    expect(result.found).toBe(true);
  });

  it('converts a thrown error into a "skipped - unavailable" result instead of throwing', async () => {
    const result = await runStageSafely('camunda', async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:8080');
    });

    expect(result.status).toBe('skipped');
    expect(result.found).toBe(false);
    expect(result.skipReason).toContain('unavailable: connect ECONNREFUSED');
    expect(result.stage).toBe('camunda');
  });

  it('handles a non-Error throw value gracefully', async () => {
    const result = await runStageSafely('newRelic', async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'timeout';
    });
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe('unavailable: timeout');
  });
});

describe('ticketText / matchesAny', () => {
  const ticket: RCATicketInput = {
    ticketId: 'T1',
    summary: 'Bank details are wrong',
    description: 'The supplier bank account is missing.',
  };

  it('combines summary and description into one lowercased haystack', () => {
    expect(ticketText(ticket)).toBe('bank details are wrong the supplier bank account is missing.');
  });

  it('matches when any pattern hits', () => {
    expect(matchesAny(ticketText(ticket), [/nonexistent/i, /bank/i])).toBe(true);
  });

  it('returns false when no pattern hits', () => {
    expect(matchesAny(ticketText(ticket), [/nonexistent/i, /camunda/i])).toBe(false);
  });
});
