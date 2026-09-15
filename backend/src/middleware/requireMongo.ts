import { NextFunction, Request, Response } from 'express';
import { isMongoConnected } from '../config/db';

/**
 * Guards any route that touches a Mongoose model. Instead of letting the route
 * throw when Mongo isn't configured/connected, this returns a clear 503 so
 * clients (and the dashboard) can show "feature disabled" instead of a crash.
 */
export function requireMongo(_req: Request, res: Response, next: NextFunction): void {
  if (!isMongoConnected()) {
    res.status(503).json({
      error: 'MongoDB is not configured or unavailable — this feature is disabled.',
      feature: 'disabled',
    });
    return;
  }
  next();
}
