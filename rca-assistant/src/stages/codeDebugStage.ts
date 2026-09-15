/**
 * STAGE 5: Code-Debug (last resort)
 *
 * Extracts keywords from the ticket text and greps the configured codebase for
 * matches, then walks backward from each match to report the nearest enclosing
 * function/class as the suspect. This is a search tool, not a guesser: it never
 * returns a root cause without a concrete file/line match to point at.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import { env } from '../config/env';
import { RCATicketInput, StageResult } from '../types/rca';
import { completedResult, matchesAny, runStageSafely, ticketText } from './stageUtils';

const execFileAsync = promisify(execFile);

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'has', 'been', 'were', 'will', 'would', 'could',
  'should', 'please', 'ticket', 'issue', 'error', 'supplier', 'when', 'what', 'about',
  'them', 'they', 'there', 'their', 'into', 'unable', 'cannot', 'getting', 'seeing',
]);

export function extractKeywords(ticket: RCATicketInput, max = 6): string[] {
  const words = `${ticket.summary} ${ticket.description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  return Array.from(new Set(words)).slice(0, max);
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

async function grepCodebase(rootPath: string, keywords: string[]): Promise<GrepMatch[]> {
  const pattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  try {
    const { stdout } = await execFileAsync(
      'grep',
      [
        '-rniE',
        '--include=*.ts',
        '--include=*.js',
        '--exclude-dir=node_modules',
        '--exclude-dir=.git',
        '--exclude-dir=dist',
        pattern,
        rootPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return parseGrepOutput(stdout);
  } catch (err: any) {
    if (err.code === 1) return []; // grep exit code 1 = no matches, not an error
    throw err;
  }
}

function parseGrepOutput(stdout: string): GrepMatch[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = /^(.*?):(\d+):(.*)$/.exec(line);
      if (!match) return null;
      return { file: match[1], line: Number(match[2]), content: match[3] };
    })
    .filter((m): m is GrepMatch => m !== null);
}

const FUNCTION_DECLARATION_PATTERNS = [
  /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/,
  /^\s*(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s*)?\(/,
  /^\s*(public|private|protected)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/,
  /^\s*(export\s+)?class\s+(\w+)/,
];

function findEnclosingFunction(filePath: string, lineNumber: number): string | undefined {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (let i = Math.min(lineNumber, lines.length) - 1; i >= 0; i--) {
    for (const pattern of FUNCTION_DECLARATION_PATTERNS) {
      const m = pattern.exec(lines[i]);
      if (m) return lines[i].trim();
    }
  }
  return undefined;
}

async function runRealCodeDebugCheck(ticket: RCATicketInput): Promise<StageResult> {
  const rootPath = env.codeDebug.rootPath as string;
  const keywords = extractKeywords(ticket);

  if (keywords.length === 0) {
    return completedResult(
      'codeDebug',
      false,
      '',
      'Could not extract meaningful keywords from the ticket summary/description to search the codebase.',
      'low',
      { keywords }
    );
  }

  const matches = await grepCodebase(rootPath, keywords);

  if (matches.length === 0) {
    return completedResult(
      'codeDebug',
      false,
      '',
      `Grepped codebase at ${rootPath} for keywords [${keywords.join(', ')}] - no matches found.`,
      'low',
      { rootPath, keywords, matchCount: 0 }
    );
  }

  const matchesByFile = new Map<string, GrepMatch[]>();
  for (const m of matches) {
    matchesByFile.set(m.file, [...(matchesByFile.get(m.file) || []), m]);
  }
  const [topFile, topMatches] = [...matchesByFile.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const primaryMatch = topMatches[0];
  const enclosingFunction = findEnclosingFunction(topFile, primaryMatch.line);

  return completedResult(
    'codeDebug',
    true,
    `Keyword match(es) for [${keywords.join(', ')}] concentrated in ${topFile}` +
      (enclosingFunction ? ` inside "${enclosingFunction}"` : '') +
      ` (${topMatches.length} matching line(s)). Suspect this code path is involved - needs engineer review, not a confirmed root cause.`,
    JSON.stringify({ file: topFile, line: primaryMatch.line, content: primaryMatch.content, enclosingFunction }),
    topMatches.length >= 3 ? 'medium' : 'low',
    {
      rootPath,
      keywords,
      matchCount: matches.length,
      suspectFile: topFile,
      suspectLine: primaryMatch.line,
      enclosingFunction,
      allMatches: matches.slice(0, 20),
    }
  );
}

const MOCK_CODE_PATTERNS = [/\bbug\b/i, /defect/i, /unexpected behavio(u)?r/i, /stack trace/i];

async function runMockCodeDebugCheck(ticket: RCATicketInput): Promise<StageResult> {
  const found = matchesAny(ticketText(ticket), MOCK_CODE_PATTERNS);
  return completedResult(
    'codeDebug',
    found,
    found ? '[MOCK] Ticket language suggests a genuine code defect requiring engineering investigation.' : '',
    '[MOCK] No CODE_DEBUG_ROOT_PATH configured - keyword heuristic used instead of a real grep search.',
    found ? 'low' : 'low',
    { mode: 'mock', keywords: extractKeywords(ticket) },
    true
  );
}

export async function debugCode(ticket: RCATicketInput): Promise<StageResult> {
  return runStageSafely('codeDebug', async () => {
    if (!env.codeDebug.rootPath) {
      return runMockCodeDebugCheck(ticket);
    }
    return runRealCodeDebugCheck(ticket);
  });
}
