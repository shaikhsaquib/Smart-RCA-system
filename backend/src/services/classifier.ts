import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { loadTaxonomy, assignableCategoryNames } from './taxonomy';
import { CategorizationResult, ConfidenceLevel, NormalizedTicket } from '../types/ticket';

const CLASSIFY_TOOL_NAME = 'classify_ticket';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.getRequiredAnthropicKey() });
  }
  return client;
}

function buildSystemPrompt(): string {
  const taxonomy = loadTaxonomy();
  const categoryBlocks = taxonomy.categories
    .filter((c) => c.name !== 'Uncategorized')
    .map((c) => {
      const examples = c.examples.map((e) => `    - "${e}"`).join('\n');
      return `- **${c.name}**: ${c.definition}\n  Examples:\n${examples}`;
    })
    .join('\n\n');

  return [
    'You are a support-ticket classifier for the Supplier module of an internal procurement system.',
    'Classify each ticket into exactly one of the following categories, based on its summary and description:',
    '',
    categoryBlocks,
    '',
    'Rules:',
    '- Choose the single best-fitting category. Never invent a category name outside this list.',
    '- If the ticket is ambiguous, sparse, or genuinely does not fit any category well, still pick the closest category but set confidence to "low".',
    '- confidence must be "high", "medium", or "low", reflecting how certain you are.',
    '- rationale must be a single concise sentence explaining the choice.',
  ].join('\n');
}

/**
 * Classifies a single ticket via the Claude API, using tool-calling to force
 * structured (category, confidence, rationale) output rather than parsing free text.
 */
export async function classifyTicket(ticket: NormalizedTicket): Promise<CategorizationResult> {
  const taxonomy = loadTaxonomy();
  const categoryNames = assignableCategoryNames(taxonomy);

  // Empty/near-empty descriptions are not sent to the LLM - fallback per FSD section 8.
  const hasContent = (ticket.summary + ' ' + ticket.description).trim().length >= 8;
  if (!hasContent) {
    return {
      category: 'Uncategorized',
      confidence: 'low',
      rationale: 'Ticket has an empty or near-empty description; skipped LLM classification.',
    };
  }

  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: env.anthropicModel,
    max_tokens: 300,
    system: buildSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: `Ticket summary: ${ticket.summary}\n\nTicket description: ${ticket.description || '(none)'}`,
      },
    ],
    tools: [
      {
        name: CLASSIFY_TOOL_NAME,
        description: 'Record the classification result for this ticket.',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: categoryNames },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            rationale: { type: 'string' },
          },
          required: ['category', 'confidence', 'rationale'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: CLASSIFY_TOOL_NAME },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    return {
      category: 'Uncategorized',
      confidence: 'low',
      rationale: 'Classifier did not return a structured result.',
    };
  }

  const input = toolUse.input as { category?: string; confidence?: string; rationale?: string };

  if (!input.category || !categoryNames.includes(input.category)) {
    return {
      category: 'Uncategorized',
      confidence: 'low',
      rationale: `Classifier returned an invalid category ("${input.category}"); flagged for manual review.`,
    };
  }

  const confidence: ConfidenceLevel =
    input.confidence === 'high' || input.confidence === 'medium' || input.confidence === 'low'
      ? input.confidence
      : 'low';

  return applyConfidenceThreshold(
    {
      category: input.category,
      confidence,
      rationale: input.rationale || '',
    },
    taxonomy.confidenceThreshold
  );
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

function applyConfidenceThreshold(
  result: CategorizationResult,
  threshold: ConfidenceLevel
): CategorizationResult {
  if (CONFIDENCE_RANK[result.confidence] < CONFIDENCE_RANK[threshold]) {
    return {
      category: 'Uncategorized',
      confidence: result.confidence,
      rationale: `Below confidence threshold (${threshold}); original guess was "${result.category}": ${result.rationale}`,
    };
  }
  return result;
}
