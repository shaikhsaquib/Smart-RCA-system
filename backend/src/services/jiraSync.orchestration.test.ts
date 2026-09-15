const mockIsMongoConnected = jest.fn();
jest.mock('../config/db', () => ({
  isMongoConnected: () => mockIsMongoConnected(),
}));

const mockEnv: any = {
  jiraKb: {
    projectKey: 'SUPPORT',
    matchField: 'component',
    component: 'Supplier Profile',
    assigneeNames: ['Saquib Shaikh'],
    chunkSizeChars: 1500,
  },
  embedding: { provider: 'voyage', voyageModel: 'voyage-3' },
};
jest.mock('../config/env', () => ({ env: mockEnv }));

const mockFindAccountIdByDisplayName = jest.fn();
const mockSearchAllRaw = jest.fn();
jest.mock('./jiraClient', () => {
  const actual = jest.requireActual('./jiraClient');
  return {
    ...actual,
    JiraClient: jest.fn().mockImplementation(() => ({
      findAccountIdByDisplayName: mockFindAccountIdByDisplayName,
      searchAllRaw: mockSearchAllRaw,
    })),
  };
});

const mockEmbed = jest.fn();
jest.mock('./embeddingProvider', () => ({
  getEmbeddingProvider: () => ({ embed: mockEmbed }),
}));

const mockUpsertKbChunks = jest.fn();
const mockEnsureVectorIndex = jest.fn();
jest.mock('./knowledgeBase', () => ({
  upsertKbChunks: (...args: unknown[]) => mockUpsertKbChunks(...args),
  ensureVectorIndex: (...args: unknown[]) => mockEnsureVectorIndex(...args),
}));

import { syncJiraKnowledgeBase } from './jiraSync';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.jiraKb.projectKey = 'SUPPORT';
  mockEnv.jiraKb.component = 'Supplier Profile';
  mockEnv.jiraKb.assigneeNames = ['Saquib Shaikh'];
});

describe('syncJiraKnowledgeBase - guards', () => {
  it('fails with a clear message (not a raw stack trace) when Mongo is not configured', async () => {
    mockIsMongoConnected.mockReturnValue(false);

    await expect(syncJiraKnowledgeBase()).rejects.toThrow(/MongoDB is not configured/);
    expect(mockFindAccountIdByDisplayName).not.toHaveBeenCalled();
  });

  it('fails with a message naming the missing env vars when KB config is incomplete', async () => {
    mockIsMongoConnected.mockReturnValue(true);
    mockEnv.jiraKb.component = undefined;

    await expect(syncJiraKnowledgeBase()).rejects.toThrow(/JIRA_KB_COMPONENT/);
  });
});

describe('syncJiraKnowledgeBase - happy path', () => {
  it('resolves assignees, fetches issues, chunks + embeds + upserts, and returns counts', async () => {
    mockIsMongoConnected.mockReturnValue(true);
    mockFindAccountIdByDisplayName.mockResolvedValue('account-123');
    mockSearchAllRaw.mockResolvedValue([
      {
        key: 'SUPPORT-1',
        fields: {
          summary: 'Bank details wrong',
          description: 'Details are incorrect',
          status: { name: 'Open' },
          assignee: { displayName: 'Saquib Shaikh' },
        },
      },
    ]);
    mockEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockUpsertKbChunks.mockResolvedValue({ upserted: 1 });

    const result = await syncJiraKnowledgeBase();

    expect(mockFindAccountIdByDisplayName).toHaveBeenCalledWith('Saquib Shaikh');
    expect(mockSearchAllRaw).toHaveBeenCalledWith(
      expect.stringContaining('assignee in ("account-123")'),
      expect.any(Array)
    );
    expect(mockEmbed).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('Bank details wrong')]), 'document');
    expect(mockUpsertKbChunks).toHaveBeenCalledTimes(1);
    expect(mockEnsureVectorIndex).toHaveBeenCalledWith(3);
    expect(result).toEqual({ issuesFetched: 1, documentsEmbedded: 1, upserted: 1 });
  });

  it('throws when none of the configured assignee names resolve to an accountId', async () => {
    mockIsMongoConnected.mockReturnValue(true);
    mockFindAccountIdByDisplayName.mockResolvedValue(null);

    await expect(syncJiraKnowledgeBase()).rejects.toThrow(/could be resolved to a Jira accountId/);
    expect(mockSearchAllRaw).not.toHaveBeenCalled();
  });
});
