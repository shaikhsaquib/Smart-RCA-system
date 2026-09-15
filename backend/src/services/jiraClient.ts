import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { NormalizedTicket } from '../types/ticket';

interface JiraSearchResponse {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

interface JiraRawSearchResponse {
  issues: JiraRawIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

/** Generic raw issue shape for callers (like the KB sync) that need fields beyond
 *  the fixed set JiraIssue/normalizeIssue() were built for. */
export interface JiraRawIssue {
  key: string;
  fields: Record<string, any>;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: unknown;
    status: { name: string };
    priority: { name: string } | null;
    reporter: { displayName?: string; emailAddress?: string } | null;
    created: string;
    resolutiondate: string | null;
    labels: string[];
  };
}

export function extractPlainText(description: unknown): string {
  if (!description) return '';
  if (typeof description === 'string') return description;

  // Jira Cloud returns Atlassian Document Format (ADF) for rich text fields.
  const walk = (node: any): string => {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map(walk).join(' ');
    }
    return '';
  };
  return walk(description).trim();
}

export class JiraClient {
  private http: AxiosInstance;

  constructor() {
    const { baseUrl, email, apiToken } = env.getRequiredJiraConfig();
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/+$/, ''),
      auth: { username: email, password: apiToken },
      headers: { Accept: 'application/json' },
      timeout: 15000,
    });
  }

  /**
   * Fetches all issues matching the JQL, paginating through results.
   * Retries with backoff on 429 (rate limit).
   */
  async searchAll(jql: string, pageSize = 100): Promise<NormalizedTicket[]> {
    const results: NormalizedTicket[] = [];
    let startAt = 0;
    let total = Infinity;

    while (startAt < total) {
      const page = await this.searchPageWithRetry(jql, startAt, pageSize);
      total = page.total;
      startAt += page.issues.length;
      results.push(...page.issues.map(normalizeIssue));

      if (page.issues.length === 0) break; // safety against infinite loop
    }

    return results;
  }

  /**
   * Generic paginated search returning raw issue fields, for callers (the Jira KB
   * sync) that need fields beyond the fixed set searchAll()/normalizeIssue() use.
   */
  async searchAllRaw(jql: string, fields: string[], pageSize = 100): Promise<JiraRawIssue[]> {
    const results: JiraRawIssue[] = [];
    let startAt = 0;
    let total = Infinity;

    while (startAt < total) {
      const page = await this.searchPageRawWithRetry(jql, startAt, pageSize, fields);
      total = page.total;
      startAt += page.issues.length;
      results.push(...page.issues);

      if (page.issues.length === 0) break;
    }

    return results;
  }

  /** Resolves a display name to a Jira accountId via the user search API - names
   *  alone aren't reliable JQL filters, so callers should resolve before building JQL. */
  async findAccountIdByDisplayName(displayName: string): Promise<string | null> {
    const { data } = await this.http.get<{ accountId: string; displayName: string }[]>(
      '/rest/api/3/user/search',
      { params: { query: displayName, maxResults: 5 } }
    );

    const exactMatch = data.find((u) => u.displayName.toLowerCase() === displayName.toLowerCase());
    return exactMatch?.accountId ?? data[0]?.accountId ?? null;
  }

  private async searchPageRawWithRetry(
    jql: string,
    startAt: number,
    maxResults: number,
    fields: string[],
    attempt = 1
  ): Promise<JiraRawSearchResponse> {
    try {
      const { data } = await this.http.get<JiraRawSearchResponse>('/rest/api/3/search', {
        params: { jql, startAt, maxResults, fields: fields.join(',') },
      });
      return data;
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 401 || status === 403) {
        throw new Error(`Jira authentication failed (${status}). Check JIRA_EMAIL / JIRA_API_TOKEN.`);
      }

      if (status === 429 && attempt <= 5) {
        const delayMs = 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.searchPageRawWithRetry(jql, startAt, maxResults, fields, attempt + 1);
      }

      throw err;
    }
  }

  private async searchPageWithRetry(
    jql: string,
    startAt: number,
    maxResults: number,
    attempt = 1
  ): Promise<JiraSearchResponse> {
    try {
      const { data } = await this.http.get<JiraSearchResponse>('/rest/api/3/search', {
        params: {
          jql,
          startAt,
          maxResults,
          fields: 'summary,description,status,priority,reporter,created,resolutiondate,labels',
        },
      });
      return data;
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 401 || status === 403) {
        throw new Error(
          `Jira authentication failed (${status}). Check JIRA_EMAIL / JIRA_API_TOKEN.`
        );
      }

      if (status === 429 && attempt <= 5) {
        const delayMs = 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.searchPageWithRetry(jql, startAt, maxResults, attempt + 1);
      }

      throw err;
    }
  }
}

function normalizeIssue(issue: JiraIssue): NormalizedTicket {
  return {
    key: issue.key,
    summary: issue.fields.summary || '',
    description: extractPlainText(issue.fields.description),
    status: issue.fields.status?.name || 'Unknown',
    priority: issue.fields.priority?.name || 'Unset',
    reporter: issue.fields.reporter?.emailAddress || issue.fields.reporter?.displayName || '',
    createdAt: new Date(issue.fields.created),
    resolvedAt: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null,
    labels: issue.fields.labels || [],
  };
}
