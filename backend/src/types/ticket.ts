export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface NormalizedTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  reporter: string;
  createdAt: Date;
  resolvedAt: Date | null;
  labels: string[];
}

export interface CategorizationResult {
  category: string;
  confidence: ConfidenceLevel;
  rationale: string;
}
