import { Ticket } from '../models/Ticket';

export interface CategoryCount {
  category: string;
  count: number;
}

export interface TrendPoint {
  week: string;
  category: string;
  count: number;
}

export interface SummaryReport {
  totalTickets: number;
  byCategory: CategoryCount[];
  byPriority: { category: string; priority: string; count: number }[];
  trend: TrendPoint[];
  lowConfidenceRate: number;
}

interface DateRange {
  from?: Date;
  to?: Date;
}

function dateMatch(range: DateRange): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (range.from || range.to) {
    match.createdAt = {};
    if (range.from) (match.createdAt as Record<string, Date>).$gte = range.from;
    if (range.to) (match.createdAt as Record<string, Date>).$lte = range.to;
  }
  return match;
}

export async function getSummaryReport(range: DateRange = {}): Promise<SummaryReport> {
  const match = { ...dateMatch(range), category: { $ne: null } };

  const [totalTickets, byCategoryAgg, byPriorityAgg, trendAgg, lowConfidenceAgg] =
    await Promise.all([
      Ticket.countDocuments(match),

      Ticket.aggregate([
        { $match: match },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Ticket.aggregate([
        { $match: match },
        { $group: { _id: { category: '$category', priority: '$priority' }, count: { $sum: 1 } } },
      ]),

      Ticket.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              week: { $dateTrunc: { date: '$createdAt', unit: 'week' } },
              category: '$category',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.week': 1 } },
      ]),

      Ticket.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            lowConfidence: {
              $sum: {
                $cond: [
                  { $or: [{ $eq: ['$category', 'Uncategorized'] }, { $eq: ['$confidence', 'low'] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

  const lowConfidence = lowConfidenceAgg[0];
  const lowConfidenceRate = lowConfidence && lowConfidence.total > 0
    ? lowConfidence.lowConfidence / lowConfidence.total
    : 0;

  return {
    totalTickets,
    byCategory: byCategoryAgg.map((r) => ({ category: r._id, count: r.count })),
    byPriority: byPriorityAgg.map((r) => ({
      category: r._id.category,
      priority: r._id.priority,
      count: r.count,
    })),
    trend: trendAgg.map((r) => ({
      week: r._id.week.toISOString().slice(0, 10),
      category: r._id.category,
      count: r.count,
    })),
    lowConfidenceRate: Math.round(lowConfidenceRate * 100) / 100,
  };
}
