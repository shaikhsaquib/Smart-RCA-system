import { NormalizedTicket } from '../types/ticket';

// Mock the Anthropic SDK so these tests run instantly, for free, and offline -
// no real API key or network call needed.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// classifyTicket lazily reads ANTHROPIC_API_KEY only when it needs a real client.
process.env.ANTHROPIC_API_KEY = 'test-key';

import { classifyTicket } from './classifier';

function baseTicket(overrides: Partial<NormalizedTicket> = {}): NormalizedTicket {
  return {
    key: 'SUPPORT-1',
    summary: 'Supplier bank details are wrong',
    description: 'The bank account number on file for this supplier is incorrect.',
    status: 'Open',
    priority: 'High',
    reporter: 'someone@example.com',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    labels: [],
    ...overrides,
  };
}

function toolResponse(input: Record<string, unknown>) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'classify_ticket', input }],
  };
}

describe('classifyTicket', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('accepts a high-confidence, valid-category response as-is', async () => {
    mockCreate.mockResolvedValueOnce(
      toolResponse({
        category: 'Data Correction',
        confidence: 'high',
        rationale: 'User is asking to fix incorrect bank details.',
      })
    );

    const result = await classifyTicket(baseTicket());

    expect(result.category).toBe('Data Correction');
    expect(result.confidence).toBe('high');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('never calls the LLM for an empty/near-empty description (FSD error handling)', async () => {
    const result = await classifyTicket(
      baseTicket({ summary: 'hi', description: '' })
    );

    expect(result.category).toBe('Uncategorized');
    expect(result.confidence).toBe('low');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('falls back to Uncategorized when the model invents a category outside the taxonomy', async () => {
    mockCreate.mockResolvedValueOnce(
      toolResponse({
        category: 'Something Made Up',
        confidence: 'high',
        rationale: 'n/a',
      })
    );

    const result = await classifyTicket(baseTicket());

    expect(result.category).toBe('Uncategorized');
  });

  it('downgrades a low-confidence classification to Uncategorized per the taxonomy threshold', async () => {
    mockCreate.mockResolvedValueOnce(
      toolResponse({
        category: 'Bug',
        confidence: 'low',
        rationale: 'Not fully sure this is a defect.',
      })
    );

    const result = await classifyTicket(baseTicket());

    // taxonomy.json sets confidenceThreshold: "medium", so "low" must be demoted.
    expect(result.category).toBe('Uncategorized');
    expect(result.confidence).toBe('low');
    expect(result.rationale).toContain('Bug');
  });

  it('falls back to Uncategorized if the model returns no tool call at all', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'I refuse to classify this.' }] });

    const result = await classifyTicket(baseTicket());

    expect(result.category).toBe('Uncategorized');
  });
});
