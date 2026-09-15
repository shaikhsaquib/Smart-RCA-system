/**
 * Swappable embedding provider interface for the Jira knowledge base.
 *
 * Anthropic has no first-party embeddings endpoint, so the KB needs an external
 * provider. Voyage AI is Anthropic's recommended embedding partner and is the
 * default here; OpenAI is included as a drop-in alternative behind the same
 * interface (EMBEDDING_PROVIDER=openai). Swap in a different provider later by
 * adding a class that implements EmbeddingProvider and returning it from
 * getEmbeddingProvider() - nothing else in knowledgeBase.ts/jiraSync.ts changes.
 */
import axios from 'axios';
import { env } from '../config/env';

export type EmbeddingInputType = 'document' | 'query';

export interface EmbeddingProvider {
  /** Embeds a batch of texts. Use 'query' for search-time queries and 'document'
   *  for content being stored, when the provider supports asymmetric embeddings. */
  embed(texts: string[], inputType?: EmbeddingInputType): Promise<number[][]>;
}

const BATCH_SIZE = 64;

async function embedInBatches(
  texts: string[],
  callBatch: (batch: string[]) => Promise<number[][]>
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    results.push(...(await callBatch(batch)));
  }
  return results;
}

class VoyageEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[], inputType: EmbeddingInputType = 'document'): Promise<number[][]> {
    if (!env.embedding.voyageApiKey) {
      throw new Error('VOYAGE_API_KEY is not set (required when EMBEDDING_PROVIDER=voyage).');
    }

    return embedInBatches(texts, async (batch) => {
      const { data } = await axios.post(
        'https://api.voyageai.com/v1/embeddings',
        { input: batch, model: env.embedding.voyageModel, input_type: inputType },
        {
          headers: {
            Authorization: `Bearer ${env.embedding.voyageApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      return data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((d: { embedding: number[] }) => d.embedding);
    });
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (!env.embedding.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set (required when EMBEDDING_PROVIDER=openai).');
    }

    return embedInBatches(texts, async (batch) => {
      const { data } = await axios.post(
        'https://api.openai.com/v1/embeddings',
        { input: batch, model: env.embedding.openaiModel },
        {
          headers: {
            Authorization: `Bearer ${env.embedding.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      return data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((d: { embedding: number[] }) => d.embedding);
    });
  }
}

let cachedProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    cachedProvider = env.embedding.provider === 'openai' ? new OpenAIEmbeddingProvider() : new VoyageEmbeddingProvider();
  }
  return cachedProvider;
}
