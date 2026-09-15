/**
 * Jira -> Knowledge Base sync (Task 2).
 *
 * Fetches Jira issues matching a configurable field/value and assignee list,
 * normalizes + chunks + embeds them, and upserts the result into MongoDB Atlas
 * Vector Search so they can be retrieved as RAG context for RCA answers.
 *
 * Nothing here is hardcoded: the project key, match field, match value, and
 * assignee names all come from env (JIRA_KB_PROJECT_KEY / JIRA_KB_MATCH_FIELD /
 * JIRA_KB_COMPONENT / JIRA_KB_ASSIGNEES), so this is reusable for other ticket
 * sets later. The match field is configurable rather than a hardcoded
 * `component = ...` because on GEP's actual Jira, "Supplier Profile" turned out
 * to live in a custom field ("Actionable-Team", cf[15279]), not a component or
 * label - see env.ts for how that was confirmed.
 */
import { isMongoConnected } from '../config/db';
import { env } from '../config/env';
import { extractPlainText, JiraClient, JiraRawIssue } from './jiraClient';
import { getEmbeddingProvider } from './embeddingProvider';
import { ensureVectorIndex, KbChunkInput, upsertKbChunks } from './knowledgeBase';

const KB_SEARCH_FIELDS = [
  'summary',
  'description',
  'status',
  'assignee',
  'resolution',
  'comment',
  'created',
  'updated',
  'labels',
  'components',
];

export interface JiraKbIssue {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string;
  resolution: string;
  comments: string;
  created: Date | null;
  updated: Date | null;
  labels: string[];
  components: string[];
}

export interface JiraSyncResult {
  issuesFetched: number;
  documentsEmbedded: number;
  upserted: number;
}

function requireKbConfig(): {
  projectKey: string;
  matchField: string;
  component: string;
  assigneeNames: string[];
} {
  const missing: string[] = [];
  if (!env.jiraKb.projectKey) missing.push('JIRA_KB_PROJECT_KEY');
  if (!env.jiraKb.component) missing.push('JIRA_KB_COMPONENT');
  if (env.jiraKb.assigneeNames.length === 0) missing.push('JIRA_KB_ASSIGNEES');

  if (missing.length > 0) {
    throw new Error(`Jira KB sync is not configured. Set the following in your .env: ${missing.join(', ')}`);
  }

  return {
    projectKey: env.jiraKb.projectKey as string,
    matchField: env.jiraKb.matchField,
    component: env.jiraKb.component as string,
    assigneeNames: env.jiraKb.assigneeNames,
  };
}

/** cf[12345] -> "customfield_12345", so the sync also requests that field from Jira. */
function customFieldIdFromMatchField(matchField: string): string | null {
  const match = /^cf\[(\d+)\]$/.exec(matchField.trim());
  return match ? `customfield_${match[1]}` : null;
}

/** Resolves each display name to a Jira accountId - names alone aren't reliable JQL filters. */
export async function resolveAssigneeAccountIds(
  jira: JiraClient,
  names: string[]
): Promise<{ accountIds: string[]; unresolved: string[] }> {
  const accountIds: string[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    const accountId = await jira.findAccountIdByDisplayName(name);
    if (accountId) {
      accountIds.push(accountId);
    } else {
      unresolved.push(name);
    }
  }

  return { accountIds, unresolved };
}

export function buildJql(projectKey: string, accountIds: string[], matchField: string, matchValue: string): string {
  const accountIdList = accountIds.map((id) => `"${id}"`).join(', ');
  return `project = "${projectKey}" AND assignee in (${accountIdList}) AND ${matchField} = "${matchValue}" ORDER BY updated DESC`;
}

function flattenComments(commentField: unknown): string {
  const comments = (commentField as { comments?: { body: unknown }[] } | undefined)?.comments;
  if (!comments || comments.length === 0) return '';
  return comments.map((c) => extractPlainText(c.body)).join('\n\n');
}

export function normalizeKbIssue(raw: JiraRawIssue): JiraKbIssue {
  const f = raw.fields;
  return {
    key: raw.key,
    summary: f.summary || '',
    description: extractPlainText(f.description),
    status: f.status?.name || 'Unknown',
    assignee: f.assignee?.displayName || 'Unassigned',
    resolution: f.resolution?.name || '',
    comments: flattenComments(f.comment),
    created: f.created ? new Date(f.created) : null,
    updated: f.updated ? new Date(f.updated) : null,
    labels: f.labels || [],
    components: (f.components || []).map((c: { name: string }) => c.name),
  };
}

/** Naive fixed-size chunking with a soft break at the nearest whitespace. */
export function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      const lastSpace = trimmed.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace;
    }
    chunks.push(trimmed.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

function buildDocumentText(issue: JiraKbIssue): string {
  return [
    `Summary: ${issue.summary}`,
    `Status: ${issue.status} | Assignee: ${issue.assignee} | Resolution: ${issue.resolution || 'n/a'}`,
    `Description: ${issue.description}`,
    issue.comments ? `Comments:\n${issue.comments}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function syncJiraKnowledgeBase(): Promise<JiraSyncResult> {
  if (!isMongoConnected()) {
    throw new Error(
      'MongoDB is not configured or unavailable. Set MONGODB_URI in your .env before running the Jira KB sync.'
    );
  }

  const { projectKey, matchField, component, assigneeNames } = requireKbConfig();
  const jira = new JiraClient();

  const { accountIds, unresolved } = await resolveAssigneeAccountIds(jira, assigneeNames);
  if (unresolved.length > 0) {
    console.warn(`[jiraSync] Could not resolve accountId for: ${unresolved.join(', ')} - skipping them.`);
  }
  if (accountIds.length === 0) {
    throw new Error('None of the configured JIRA_KB_ASSIGNEES could be resolved to a Jira accountId.');
  }

  const jql = buildJql(projectKey, accountIds, matchField, component);
  console.log(`[jiraSync] JQL: ${jql}`);

  // If matchField references a custom field (cf[12345]), also request it so it's
  // available on the raw issue - useful for audit/debugging, not required for normalization.
  const customFieldId = customFieldIdFromMatchField(matchField);
  const searchFields = customFieldId ? [...KB_SEARCH_FIELDS, customFieldId] : KB_SEARCH_FIELDS;

  const rawIssues = await jira.searchAllRaw(jql, searchFields);
  console.log(`[jiraSync] Issues fetched: ${rawIssues.length}`);

  const issues = rawIssues.map(normalizeKbIssue);

  interface PendingChunk {
    ticketKey: string;
    chunkIndex: number;
    text: string;
    issue: JiraKbIssue;
  }
  const pendingChunks: PendingChunk[] = [];
  for (const issue of issues) {
    const chunks = chunkText(buildDocumentText(issue), env.jiraKb.chunkSizeChars);
    chunks.forEach((text, chunkIndex) => pendingChunks.push({ ticketKey: issue.key, chunkIndex, text, issue }));
  }
  console.log(`[jiraSync] Chunks to embed: ${pendingChunks.length}`);

  if (pendingChunks.length === 0) {
    return { issuesFetched: rawIssues.length, documentsEmbedded: 0, upserted: 0 };
  }

  const provider = getEmbeddingProvider();
  const embeddings = await provider.embed(
    pendingChunks.map((c) => c.text),
    'document'
  );
  console.log(`[jiraSync] Documents embedded: ${embeddings.length}`);

  const embeddingModelName = env.embedding.provider === 'openai' ? env.embedding.openaiModel : env.embedding.voyageModel;

  const kbChunks: KbChunkInput[] = pendingChunks.map((c, i) => ({
    ticketKey: c.ticketKey,
    chunkIndex: c.chunkIndex,
    text: c.text,
    summary: c.issue.summary,
    status: c.issue.status,
    assignee: c.issue.assignee,
    resolution: c.issue.resolution,
    labels: c.issue.labels,
    components: c.issue.components,
    createdAt: c.issue.created,
    updatedAt: c.issue.updated,
    embedding: embeddings[i],
    embeddingModel: embeddingModelName,
  }));

  const { upserted } = await upsertKbChunks(kbChunks);
  console.log(`[jiraSync] Upserted: ${upserted}`);

  await ensureVectorIndex(embeddings[0].length);

  return { issuesFetched: rawIssues.length, documentsEmbedded: kbChunks.length, upserted };
}
