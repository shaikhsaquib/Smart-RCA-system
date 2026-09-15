import { extractPlainText } from './jiraClient';

describe('extractPlainText (Atlassian Document Format parsing)', () => {
  it('returns empty string for null/undefined description', () => {
    expect(extractPlainText(null)).toBe('');
    expect(extractPlainText(undefined)).toBe('');
  });

  it('passes through a plain string description unchanged', () => {
    expect(extractPlainText('Bank details are wrong')).toBe('Bank details are wrong');
  });

  it('extracts text from a single ADF paragraph', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Supplier address needs correction' }],
        },
      ],
    };
    expect(extractPlainText(adf)).toBe('Supplier address needs correction');
  });

  it('joins text across multiple paragraphs and nested nodes', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second line.' }] },
      ],
    };
    expect(extractPlainText(adf)).toBe('First line. Second line.');
  });

  it('returns empty string for an ADF doc with no text nodes (e.g. only an image)', () => {
    const adf = { type: 'doc', content: [{ type: 'mediaSingle', content: [] }] };
    expect(extractPlainText(adf)).toBe('');
  });
});
