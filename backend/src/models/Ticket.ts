import { Schema, model, InferSchemaType } from 'mongoose';

const ticketSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    summary: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, required: true },
    priority: { type: String, required: true },
    reporter: { type: String, default: '' },
    createdAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    labels: { type: [String], default: [] },

    category: { type: String, default: null, index: true },
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: null },
    rationale: { type: String, default: null },
    categorizedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: 'syncedAt' } }
);

ticketSchema.index({ category: 1, createdAt: 1 });
ticketSchema.index({ priority: 1 });

export type TicketDocument = InferSchemaType<typeof ticketSchema>;
export const Ticket = model('Ticket', ticketSchema);
