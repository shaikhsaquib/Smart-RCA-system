import { checkCamundaLogs } from './camundaStage';

describe('checkCamundaLogs - mock mode (no CAMUNDA_BASE_URL configured)', () => {
  it('flags found=true (mocked) when ticket language suggests a stuck workflow', async () => {
    const result = await checkCamundaLogs({
      ticketId: 'T1',
      summary: 'Onboarding stuck',
      description: 'The process instance for this supplier appears stuck in Camunda.',
    });
    expect(result.found).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.stage).toBe('camunda');
  });

  it('flags found=false when ticket language does not suggest a workflow issue', async () => {
    const result = await checkCamundaLogs({
      ticketId: 'T2',
      summary: 'Bank details wrong',
      description: 'The bank details on the supplier record are incorrect.',
    });
    expect(result.found).toBe(false);
    expect(result.mocked).toBe(true);
  });

  it('falls back to ticketId as the business key when supplierId is absent', async () => {
    const result = await checkCamundaLogs({ ticketId: 'FALLBACK-1', summary: 'incident reported', description: '' });
    expect(result.details.businessKey).toBe('FALLBACK-1');
  });
});
