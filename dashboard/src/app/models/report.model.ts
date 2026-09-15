export interface CategoryCount {
  category: string;
  count: number;
}

export interface TrendPoint {
  week: string;
  category: string;
  count: number;
}

export interface PriorityBreakdown {
  category: string;
  priority: string;
  count: number;
}

export interface SummaryReport {
  totalTickets: number;
  byCategory: CategoryCount[];
  byPriority: PriorityBreakdown[];
  trend: TrendPoint[];
  lowConfidenceRate: number;
}

export interface Ticket {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  reporter: string;
  createdAt: string;
  resolvedAt: string | null;
  category: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  rationale: string | null;
}
