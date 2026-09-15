const mockIsMongoConnected = jest.fn();
jest.mock('../config/db', () => ({
  isMongoConnected: () => mockIsMongoConnected(),
}));

const mockEnv: any = {
  jiraKb: { vectorIndexName: 'jira_kb_vector_index', collectionName: 'jira_kb_chunks' },
};
jest.mock('../config/env', () => ({ env: mockEnv }));

const mockBulkWrite = jest.fn();
const mockAggregate = jest.fn();
const mockCreateSearchIndex = jest.fn();
jest.mock('../models/JiraKbChunk', () => ({
  JiraKbChunk: {
    bulkWrite: (...args: unknown[]) => mockBulkWrite(...args),
    aggregate: (...args: unknown[]) => mockAggregate(...args),
    collection: { createSearchIndex: (...args: unknown[]) => mockCreateSearchIndex(...args) },
  },
}));

const mockEmbed = jest.fn();
jest.mock('./embeddingProvider', () => ({
  getEmbeddingProvider: () => ({ embed: mockEmbed }),
}));

import { ensureVectorIndex, searchKnowledgeBase, upsertKbChunks } from './knowledgeBase';

beforeEach(() => jest.clearAllMocks());

describe('upsertKbChunks', () => {
  it('does nothing and returns upserted: 0 for an empty list', async () => {
    const result = await upsertKbChunks([]);
    expect(result).toEqual({ upserted: 0 });
    expect(mockBulkWrite).not.toHaveBeenCalled();
  });

  it('upserts by (ticketKey, chunkIndex) and sums upserted + modified counts', async () => {
    mockBulkWrite.mockResolvedValue({ upsertedCount: 2, modifiedCount: 1 });

    const chunk = {
      ticketKey: 'SUPPORT-1',
      chunkIndex: 0,
      text: 'hello',
      summary: 's',
      status: 'Open',
      assignee: 'a',
      resolution: '',
      labels: [],
      components: [],
      createdAt: null,
      updatedAt: null,
      embedding: [0.1, 0.2],
      embeddingModel: 'voyage-3',
    };

    const result = await upsertKbChunks([chunk]);

    expect(mockBulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { ticketKey: 'SUPPORT-1', chunkIndex: 0 },
          update: { $set: chunk },
          upsert: true,
        },
      },
    ]);
    expect(result).toEqual({ upserted: 3 });
  });
});

describe('searchKnowledgeBase', () => {
  it('fails with a clear message when Mongo is not connected, without calling the embedding provider', async () => {
    mockIsMongoConnected.mockReturnValue(false);

    await expect(searchKnowledgeBase('why is supplier sync failing')).rejects.toThrow(/MongoDB is not configured/);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('embeds the query with input_type "query" and runs a $vectorSearch aggregation', async () => {
    mockIsMongoConnected.mockReturnValue(true);
    mockEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockAggregate.mockResolvedValue([{ ticketKey: 'SUPPORT-1', summary: 's', status: 'Open', assignee: 'a', text: 't', score: 0.9 }]);

    const results = await searchKnowledgeBase('why is supplier sync failing', 3);

    expect(mockEmbed).toHaveBeenCalledWith(['why is supplier sync failing'], 'query');
    expect(mockAggregate).toHaveBeenCalledWith([
      expect.objectContaining({
        $vectorSearch: expect.objectContaining({
          index: 'jira_kb_vector_index',
          path: 'embedding',
          queryVector: [0.1, 0.2, 0.3],
          limit: 3,
        }),
      }),
      expect.anything(),
    ]);
    expect(results).toEqual([{ ticketKey: 'SUPPORT-1', summary: 's', status: 'Open', assignee: 'a', text: 't', score: 0.9 }]);
  });

  it('wraps an aggregation failure (e.g. missing index) in a clearer error message', async () => {
    mockIsMongoConnected.mockReturnValue(true);
    mockEmbed.mockResolvedValue([[0.1]]);
    mockAggregate.mockRejectedValue(new Error('index not found'));

    await expect(searchKnowledgeBase('x')).rejects.toThrow(/Vector search failed/);
  });
});

describe('ensureVectorIndex', () => {
  it('never throws, even if index creation fails', async () => {
    mockCreateSearchIndex.mockRejectedValue(new Error('insufficient permissions'));
    await expect(ensureVectorIndex(1024)).resolves.toBeUndefined();
  });

  it('requests the index with the configured name and dimensions on success', async () => {
    mockCreateSearchIndex.mockResolvedValue('jira_kb_vector_index');
    await ensureVectorIndex(1024);
    expect(mockCreateSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'jira_kb_vector_index',
        type: 'vectorSearch',
        definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: 1024, similarity: 'cosine' }] },
      })
    );
  });
});
