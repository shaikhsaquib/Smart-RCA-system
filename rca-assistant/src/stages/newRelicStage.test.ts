import { checkNewRelicLogs } from './newRelicStage';

describe('checkNewRelicLogs - mock mode (no NEW_RELIC_API_KEY/ACCOUNT_ID configured)', () => {
  it('flags found=true (mocked) when ticket language suggests an application error', async () => {
    const result = await checkNewRelicLogs({
      ticketId: 'T1',
      summary: 'Intermittent 500 errors',
      description: 'Seeing an exception and latency spikes around supplier submission.',
    });
    expect(result.found).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.stage).toBe('newRelic');
  });

  it('flags found=false when ticket language does not suggest an application error', async () => {
    const result = await checkNewRelicLogs({
      ticketId: 'T2',
      summary: 'How is approval configured',
      description: 'What triggers the auto-approval rule for suppliers?',
    });
    expect(result.found).toBe(false);
    expect(result.mocked).toBe(true);
  });

  it('derives a +/-1h time window from the ticket reportedAt', async () => {
    const result = await checkNewRelicLogs({
      ticketId: 'T3',
      summary: 'x',
      description: 'x',
      reportedAt: '2026-09-15T12:00:00Z',
    });
    expect(result.details.since).toBe('2026-09-15 11:00:00');
    expect(result.details.until).toBe('2026-09-15 13:00:00');
  });
});
