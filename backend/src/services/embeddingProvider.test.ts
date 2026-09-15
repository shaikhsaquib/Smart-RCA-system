const mockEnv: any = {
  embedding: {
    provider: 'voyage',
    voyageApiKey: 'test-voyage-key',
    voyageModel: 'voyage-3',
    openaiApiKey: 'test-openai-key',
    openaiModel: 'text-embedding-3-small',
  },
};
jest.mock('../config/env', () => ({ env: mockEnv }));

const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...args: unknown[]) => mockPost(...args) }));

import { getEmbeddingProvider } from './embeddingProvider';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.embedding.provider = 'voyage';
});

describe('VoyageEmbeddingProvider (default)', () => {
  it('calls the Voyage embeddings endpoint and returns vectors ordered by index', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: [
          { index: 1, embedding: [0.2] },
          { index: 0, embedding: [0.1] },
        ],
      },
    });

    const provider = getEmbeddingProvider();
    const vectors = await provider.embed(['a', 'b']);

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.voyageai.com/v1/embeddings',
      expect.objectContaining({ input: ['a', 'b'], model: 'voyage-3', input_type: 'document' }),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-voyage-key' }) })
    );
    // Re-sorted by index even though the API returned them out of order.
    expect(vectors).toEqual([[0.1], [0.2]]);
  });

  it('throws a clear error when VOYAGE_API_KEY is missing', async () => {
    mockEnv.embedding.voyageApiKey = undefined;
    const provider = getEmbeddingProvider();
    await expect(provider.embed(['a'])).rejects.toThrow(/VOYAGE_API_KEY/);
    mockEnv.embedding.voyageApiKey = 'test-voyage-key';
  });

  it('splits large batches into multiple API calls', async () => {
    mockPost.mockImplementation(async (_url, body) => ({
      data: { data: (body.input as string[]).map((_: string, i: number) => ({ index: i, embedding: [i] })) },
    }));

    const provider = getEmbeddingProvider();
    const texts = Array.from({ length: 130 }, (_, i) => `text-${i}`);
    const vectors = await provider.embed(texts);

    expect(mockPost).toHaveBeenCalledTimes(3); // 64 + 64 + 2
    expect(vectors).toHaveLength(130);
  });
});

describe('provider selection via EMBEDDING_PROVIDER', () => {
  it('uses OpenAI when EMBEDDING_PROVIDER=openai', async () => {
    mockEnv.embedding.provider = 'openai';
    // getEmbeddingProvider caches the instance module-wide, but each test file
    // gets a fresh module registry, so this is the first call in this process.
    jest.resetModules();
    jest.doMock('../config/env', () => ({ env: mockEnv }));
    jest.doMock('axios', () => ({ post: (...args: unknown[]) => mockPost(...args) }));
    const { getEmbeddingProvider: getProviderFresh } = require('./embeddingProvider');

    mockPost.mockResolvedValue({ data: { data: [{ index: 0, embedding: [0.5] }] } });
    const provider = getProviderFresh();
    await provider.embed(['a']);

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ input: ['a'], model: 'text-embedding-3-small' }),
      expect.anything()
    );
  });
});
