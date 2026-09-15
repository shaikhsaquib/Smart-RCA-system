import { isMongoConnected } from '../config/db';
import { env } from '../config/env';
import { JiraKbChunk } from '../models/JiraKbChunk';
import { getEmbeddingProvider } from './embeddingProvider';

export interface KbChunkInput {
  ticketKey: string;
  chunkIndex: number;
  text: string;
  summary: string;
  status: string;
  assignee: string;
  resolution: string;
  labels: string[];
  components: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
  embedding: number[];
  embeddingModel: string;
}

export interface KbSearchResult {
  ticketKey: string;
  summary: string;
  status: string;
  assignee: string;
  text: string;
  score: number;
}

/** Idempotent upsert by (ticketKey, chunkIndex) - re-running a sync updates chunks in place. */
export async function upsertKbChunks(chunks: KbChunkInput[]): Promise<{ upserted: number }> {
  if (chunks.length === 0) return { upserted: 0 };

  // Cast to `any`: mongoose's bulkWrite generics don't reconcile our nullable
  // Date fields cleanly with the schema's InferSchemaType output.
  const result = await JiraKbChunk.bulkWrite(
    chunks.map((chunk) => ({
      updateOne: {
        filter: { ticketKey: chunk.ticketKey, chunkIndex: chunk.chunkIndex },
        update: { $set: chunk },
        upsert: true,
      },
    })) as any
  );

  return { upserted: (result.upsertedCount || 0) + (result.modifiedCount || 0) };
}

/**
 * Best-effort creation of the Atlas Vector Search index. This can fail depending
 * on your Atlas tier/permissions (Vector Search index management via the driver
 * needs an Atlas cluster and sufficient privileges) - a failure here is only
 * logged, never thrown, since the reliable fallback is creating the index once
 * by hand in the Atlas UI (see README for the exact JSON to paste in).
 */
export async function ensureVectorIndex(dimensions: number): Promise<void> {
  try {
    await (JiraKbChunk.collection as any).createSearchIndex({
      name: env.jiraKb.vectorIndexName,
      type: 'vectorSearch',
      definition: {
        fields: [{ type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' }],
      },
    });
    console.log(
      `[jiraSync] Requested Atlas Vector Search index "${env.jiraKb.vectorIndexName}" (best effort - can take a few minutes to become queryable).`
    );
  } catch (err: any) {
    console.warn(
      `[jiraSync] Could not auto-create the Atlas Vector Search index "${env.jiraKb.vectorIndexName}" (${err?.message || err}). ` +
        'This is often fine (it may already exist) - otherwise create it manually; see the README.'
    );
  }
}

/**
 * Vector-searches the stored Jira knowledge base and returns the top matching
 * chunks, ready to be passed as context into a Claude API call for RCA answers.
 */
export async function searchKnowledgeBase(query: string, topK = 5): Promise<KbSearchResult[]> {
  if (!isMongoConnected()) {
    throw new Error(
      'MongoDB is not configured or unavailable. Set MONGODB_URI in your .env before searching the knowledge base.'
    );
  }

  const [queryVector] = await getEmbeddingProvider().embed([query], 'query');

  try {
    const results = await JiraKbChunk.aggregate([
      {
        $vectorSearch: {
          index: env.jiraKb.vectorIndexName,
          path: 'embedding',
          queryVector,
          numCandidates: Math.max(topK * 10, 100),
          limit: topK,
        },
      },
      {
        $project: {
          _id: 0,
          ticketKey: 1,
          summary: 1,
          status: 1,
          assignee: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    return results as KbSearchResult[];
  } catch (err: any) {
    throw new Error(
      `Vector search failed (${err?.message || err}). Make sure the Atlas Vector Search index ` +
        `"${env.jiraKb.vectorIndexName}" exists on the "${env.jiraKb.collectionName}" collection - see the README.`
    );
  }
}
