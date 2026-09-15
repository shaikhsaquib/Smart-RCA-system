import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkBuildPortalConfig } from './buildPortalStage';
import { RCATicketInput } from '../types/rca';

describe('checkBuildPortalConfig - mock mode (no snapshot configured)', () => {
  const configTicket: RCATicketInput = {
    ticketId: 'T1',
    summary: 'Field missing on screen',
    description: 'A field that was configured in the Build Portal is not showing up.',
  };
  const otherTicket: RCATicketInput = {
    ticketId: 'T2',
    summary: 'Payment run failed',
    description: 'The nightly payment run threw an exception.',
  };

  it('flags found=true (mocked) when ticket language suggests a config issue', async () => {
    const result = await checkBuildPortalConfig(configTicket);
    expect(result.found).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('flags found=false when ticket language does not suggest a config issue', async () => {
    const result = await checkBuildPortalConfig(otherTicket);
    expect(result.found).toBe(false);
    expect(result.mocked).toBe(true);
  });
});

describe('checkBuildPortalConfig - real snapshot mode', () => {
  let tmpFile: string;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('finds mismatched config fields in a provided snapshot', async () => {
    tmpFile = path.join(os.tmpdir(), `snapshot-${Date.now()}.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify([
        { screen: 'SupplierOnboarding', field: 'paymentTerms.visible', expectedValue: true, actualValue: false },
        { screen: 'SupplierOnboarding', field: 'taxId.required', expectedValue: true, actualValue: true },
      ])
    );

    const result = await checkBuildPortalConfig({ ticketId: 'T3', summary: 's', description: 'd' }, tmpFile);

    expect(result.found).toBe(true);
    expect(result.mocked).toBe(false);
    expect(result.confidence).toBe('high');
    expect(result.issue).toContain('paymentTerms.visible');
  });

  it('reports no issue when every field in the snapshot matches expected values', async () => {
    tmpFile = path.join(os.tmpdir(), `snapshot-${Date.now()}-ok.json`);
    fs.writeFileSync(
      tmpFile,
      JSON.stringify([{ screen: 'SupplierOnboarding', field: 'taxId.required', expectedValue: true, actualValue: true }])
    );

    const result = await checkBuildPortalConfig({ ticketId: 'T4', summary: 's', description: 'd' }, tmpFile);

    expect(result.found).toBe(false);
    expect(result.mocked).toBe(false);
  });

  it('fails gracefully (skipped) when the snapshot file does not exist', async () => {
    const result = await checkBuildPortalConfig(
      { ticketId: 'T5', summary: 's', description: 'd' },
      '/nonexistent/path/snapshot.json'
    );
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBeDefined();
  });
});
