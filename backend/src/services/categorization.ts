import { Ticket } from '../models/Ticket';
import { classifyTicket } from './classifier';
import { NormalizedTicket } from '../types/ticket';

export interface CategorizeResult {
  categorized: number;
  flaggedLowConfidence: number;
}

/** Categorizes every un-categorized ticket currently in the Ticket Store. */
export async function categorizeUncategorizedTickets(): Promise<CategorizeResult> {
  const pending = await Ticket.find({ category: null });

  let categorized = 0;
  let flaggedLowConfidence = 0;

  for (const doc of pending) {
    const ticket: NormalizedTicket = {
      key: doc.key,
      summary: doc.summary,
      description: doc.description || '',
      status: doc.status,
      priority: doc.priority,
      reporter: doc.reporter || '',
      createdAt: doc.createdAt,
      resolvedAt: doc.resolvedAt ?? null,
      labels: doc.labels || [],
    };

    const result = await classifyTicket(ticket);

    doc.category = result.category;
    doc.confidence = result.confidence;
    doc.rationale = result.rationale;
    doc.categorizedAt = new Date();
    await doc.save();

    categorized += 1;
    if (result.category === 'Uncategorized' || result.confidence === 'low') {
      flaggedLowConfidence += 1;
    }
  }

  return { categorized, flaggedLowConfidence };
}
