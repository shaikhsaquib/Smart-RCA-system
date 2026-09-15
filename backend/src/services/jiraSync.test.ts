import { buildJql, chunkText, normalizeKbIssue } from './jiraSync';
import { JiraRawIssue } from './jiraClient';

describe('chunkText', () => {
  it('returns the whole text as one chunk when under the limit', () => {
    expect(chunkText('short text', 100)).toEqual(['short text']);
  });

  it('returns an empty array for empty/whitespace-only text', () => {
    expect(chunkText('   ', 100)).toEqual([]);
    expect(chunkText('', 100)).toEqual([]);
  });

  it('splits long text into multiple chunks near whitespace boundaries', () => {
    const text = 'word '.repeat(50).trim(); // 50 words, ~249 chars
    const chunks = chunkText(text, 50);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // No content lost: rejoining should reproduce (roughly) the original words.
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });
});

describe('buildJql', () => {
  it('builds JQL with quoted project/component and an assignee accountId list', () => {
    const jql = buildJql('SUPPORT', ['acc-1', 'acc-2'], 'Supplier Profile');
    expect(jql).toBe(
      'project = "SUPPORT" AND assignee in ("acc-1", "acc-2") AND component = "Supplier Profile" ORDER BY updated DESC'
    );
  });
});

describe('normalizeKbIssue', () => {
  it('flattens ADF description and comments, and pulls out nested field names', () => {
    const raw: JiraRawIssue = {
      key: 'SUPPORT-42',
      fields: {
        summary: 'Bank details wrong',
        description: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bank details are incorrect.' }] }],
        },
        status: { name: 'In Progress' },
        assignee: { displayName: 'Saquib Shaikh' },
        resolution: null,
        comment: {
          comments: [
            { body: 'Looking into it.' },
            {
              body: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixed via data patch.' }] }],
              },
            },
          ],
        },
        created: '2026-09-01T00:00:00.000Z',
        updated: '2026-09-05T00:00:00.000Z',
        labels: ['supplier'],
        components: [{ name: 'Supplier Profile' }],
      },
    };

    const issue = normalizeKbIssue(raw);

    expect(issue.key).toBe('SUPPORT-42');
    expect(issue.description).toBe('Bank details are incorrect.');
    expect(issue.assignee).toBe('Saquib Shaikh');
    expect(issue.resolution).toBe('');
    expect(issue.comments).toBe('Looking into it.\n\nFixed via data patch.');
    expect(issue.components).toEqual(['Supplier Profile']);
    expect(issue.created).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('defaults assignee to "Unassigned" and handles missing comments', () => {
    const raw: JiraRawIssue = {
      key: 'SUPPORT-43',
      fields: { summary: 'x', description: '', status: { name: 'Open' } },
    };
    const issue = normalizeKbIssue(raw);
    expect(issue.assignee).toBe('Unassigned');
    expect(issue.comments).toBe('');
  });
});
