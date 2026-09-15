/**
 * STAGE 1: Build Portal Config-Check
 *
 * LIMITATION (flagging clearly, per requirements): as of this writing there is no
 * confirmed REST/GraphQL API for the Build Portal (the low-code/no-code frontend
 * config platform). This stage therefore does NOT make a live API call. Instead it
 * checks a manually-exported config snapshot (JSON) against expected values.
 *
 * TODO(real-integration): once/if the Build Portal exposes an API, replace
 * `loadConfigSnapshot()` below with a real HTTP call using env.buildPortal.apiUrl /
 * apiKey, keep `findConfigMismatches()` as-is, and this stage's public contract
 * (`checkBuildPortalConfig`) does not need to change.
 */
import fs from 'fs';
import { env } from '../config/env';
import { RCATicketInput, StageResult } from '../types/rca';
import { completedResult, matchesAny, runStageSafely, ticketText } from './stageUtils';

export interface ConfigEntry {
  screen: string;
  field: string;
  expectedValue: unknown;
  actualValue: unknown;
}

function findConfigMismatches(snapshot: ConfigEntry[]): ConfigEntry[] {
  return snapshot.filter((entry) => entry.expectedValue !== entry.actualValue);
}

function loadConfigSnapshot(path: string): ConfigEntry[] {
  const raw = fs.readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Build Portal config snapshot must be a JSON array of config entries');
  }
  return parsed as ConfigEntry[];
}

const MOCK_CONFIG_PATTERNS = [/misconfigur/i, /config(uration)?/i, /field mapping/i, /screen (setting|config)/i];

export async function checkBuildPortalConfig(
  ticket: RCATicketInput,
  snapshotPathOverride?: string
): Promise<StageResult> {
  return runStageSafely('buildPortal', async () => {
    const snapshotPath = snapshotPathOverride || env.buildPortal.configSnapshotPath;

    if (!snapshotPath) {
      // No snapshot provided and no live API exists yet - mock mode.
      const found = matchesAny(ticketText(ticket), MOCK_CONFIG_PATTERNS);
      return completedResult(
        'buildPortal',
        found,
        found
          ? '[MOCK] Ticket language suggests a frontend/config issue; a real Build Portal snapshot would confirm this.'
          : '',
        '[MOCK] No BUILD_PORTAL_CONFIG_SNAPSHOT_PATH configured - keyword heuristic used instead of a real config check.',
        found ? 'medium' : 'low',
        { mode: 'mock', ticketTextSample: ticketText(ticket) },
        true
      );
    }

    const snapshot = loadConfigSnapshot(snapshotPath);
    const mismatches = findConfigMismatches(snapshot);
    const found = mismatches.length > 0;

    return completedResult(
      'buildPortal',
      found,
      found
        ? `Found ${mismatches.length} config field(s) not matching expected value(s): ${mismatches
            .map((m) => `${m.screen}.${m.field}`)
            .join(', ')}`
        : '',
      found
        ? JSON.stringify(mismatches)
        : `Checked ${snapshot.length} config field(s) in snapshot; all matched expected values.`,
      found ? 'high' : 'high',
      { mode: 'snapshot', snapshotPath, mismatches, checkedFieldCount: snapshot.length },
      false
    );
  });
}
