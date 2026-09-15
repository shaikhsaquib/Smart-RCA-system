import { Router } from 'express';
import { getSummaryReport } from '../services/aggregation';
import { requireMongo } from '../middleware/requireMongo';

export const reportsRouter = Router();
reportsRouter.use(requireMongo);

// GET /api/reports/summary - FSD 5.3
reportsRouter.get('/summary', async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const report = await getSummaryReport({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  res.json(report);
});
