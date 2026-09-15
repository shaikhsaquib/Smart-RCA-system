import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractKeywords } from './codeDebugStage';

describe('extractKeywords', () => {
  it('extracts significant words and drops stopwords/short words', () => {
    const keywords = extractKeywords({
      ticketId: 'T1',
      summary: 'Approval button broken',
      description: 'The supplier approval button is not working when this happens.',
    });
    expect(keywords).toEqual(expect.arrayContaining(['approval', 'button', 'broken', 'working', 'happens']));
    expect(keywords).not.toContain('this');
    expect(keywords).not.toContain('supplier');
  });

  it('deduplicates repeated words', () => {
    const keywords = extractKeywords({
      ticketId: 'T2',
      summary: 'timeout timeout timeout',
      description: '',
    });
    expect(keywords).toEqual(['timeout']);
  });
});

describe('debugCode - mock mode (no CODE_DEBUG_ROOT_PATH configured)', () => {
  it('flags found=true (mocked) for ticket language suggesting a code defect', async () => {
    const { debugCode } = require('./codeDebugStage');
    const result = await debugCode({
      ticketId: 'T3',
      summary: 'Unexpected behavior',
      description: 'This looks like a genuine bug - a stack trace briefly appears.',
    });
    expect(result.found).toBe(true);
    expect(result.mocked).toBe(true);
  });
});

describe('debugCode - real grep mode', () => {
  let tmpDir: string;
  let debugCodeReal: typeof import('./codeDebugStage').debugCode;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-code-debug-'));
    fs.writeFileSync(
      path.join(tmpDir, 'paymentService.ts'),
      [
        'export function processPaymentTerms(supplierId: string) {',
        '  // looks up payment terms configuration for a supplier',
        '  return lookupPaymentTerms(supplierId);',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(path.join(tmpDir, 'unrelated.ts'), 'export const nothingHere = 1;\n');

    process.env.CODE_DEBUG_ROOT_PATH = tmpDir;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    debugCodeReal = require('./codeDebugStage').debugCode;
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.CODE_DEBUG_ROOT_PATH;
    jest.resetModules();
  });

  it('greps the codebase and identifies the suspect file and enclosing function', async () => {
    const result = await debugCodeReal({
      ticketId: 'T4',
      summary: 'Payment terms lookup failing',
      description: 'processPaymentTerms is failing for this supplier during onboarding.',
    });

    expect(result.found).toBe(true);
    expect(result.mocked).toBe(false);
    expect(result.details.suspectFile).toContain('paymentService.ts');
    expect(result.details.enclosingFunction).toContain('processPaymentTerms');
  });

  it('returns found=false when no keyword matches exist in the codebase', async () => {
    const result = await debugCodeReal({
      ticketId: 'T5',
      summary: 'Zorblatt frobnication failure',
      description: 'Completely unrelated made-up terminology that will not match anything.',
    });

    expect(result.found).toBe(false);
    expect(result.mocked).toBe(false);
  });
});
