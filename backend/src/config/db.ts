import mongoose from 'mongoose';
import { env } from './env';

/**
 * Connects to MongoDB only if MONGODB_URI is configured. Never throws: if the
 * var is missing/empty, or if the connection attempt itself fails (bad
 * credentials, unreachable cluster, timeout), this logs a single clear warning
 * and returns so the rest of the app - including the health check and any
 * Mongo-independent routes - still boots. Callers should use isMongoConnected()
 * to check whether Mongo-backed features are actually available.
 */
export async function connectMongoIfConfigured(): Promise<void> {
  if (!env.mongoUri) {
    console.warn('[startup] MONGODB_URI not set — running without MongoDB');
    return;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log('[startup] MongoDB connected');
  } catch (err: any) {
    console.warn(`[startup] Failed to connect to MongoDB (${err?.message || err}) — running without MongoDB`);
  }
}

/** Route handlers and services should check this before touching any Mongoose model. */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * For CLI scripts (not Express routes): call after connectMongoIfConfigured() and
 * before touching any Mongoose model. Prints one clear instruction and exits
 * instead of letting the script fail deeper in with a raw stack trace.
 */
export function requireMongoOrExit(context: string): void {
  if (!isMongoConnected()) {
    console.error(`[${context}] MongoDB is not configured or unavailable. Set MONGODB_URI in your .env and try again.`);
    process.exit(1);
  }
}
