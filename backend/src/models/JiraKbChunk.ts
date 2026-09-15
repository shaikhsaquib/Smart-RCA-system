import { Schema, model, InferSchemaType } from 'mongoose';
import { env } from '../config/env';

const jiraKbChunkSchema = new Schema(
  {
    ticketKey: { type: String, required: true, index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },

    // Denormalized ticket metadata, kept on every chunk so search results don't
    // need a second lookup and so callers can filter/display without a join.
    summary: { type: String, default: '' },
    status: { type: String, default: '' },
    assignee: { type: String, default: '' },
    resolution: { type: String, default: '' },
    labels: { type: [String], default: [] },
    components: { type: [String], default: [] },
    createdAt: { type: Date },
    updatedAt: { type: Date },

    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: 'syncedAt' } }
);

// Idempotent upsert key: re-running the sync updates a chunk in place instead of
// duplicating it.
jiraKbChunkSchema.index({ ticketKey: 1, chunkIndex: 1 }, { unique: true });

export type JiraKbChunkDocument = InferSchemaType<typeof jiraKbChunkSchema>;
export const JiraKbChunk = model('JiraKbChunk', jiraKbChunkSchema, env.jiraKb.collectionName);
