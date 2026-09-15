/**
 * STAGE 3: Camunda Log-Check
 *
 * Checks Camunda's REST API for incidents or stuck/unfinished process instances
 * tied to the ticket's business key (supplierId, falling back to ticketId).
 * Read-only: only GET requests against the history and runtime APIs.
 */
import axios from 'axios';
import { env } from '../config/env';
import { RCATicketInput, StageResult } from '../types/rca';
import { completedResult, matchesAny, runStageSafely, ticketText } from './stageUtils';

interface CamundaIncident {
  id: string;
  processInstanceId: string;
  incidentType: string;
  incidentMessage: string | null;
}

interface CamundaProcessInstance {
  id: string;
  businessKey: string;
  startTime: string;
  endTime: string | null;
}

function businessKeyFor(ticket: RCATicketInput): string {
  return ticket.supplierId || ticket.ticketId;
}

async function runRealCamundaCheck(ticket: RCATicketInput): Promise<StageResult> {
  const businessKey = businessKeyFor(ticket);
  const client = axios.create({
    baseURL: env.camunda.baseUrl,
    timeout: 10000,
    auth:
      env.camunda.authUsername && env.camunda.authPassword
        ? { username: env.camunda.authUsername, password: env.camunda.authPassword }
        : undefined,
  });

  const incidentParams = {
    processDefinitionKey: env.camunda.processDefinitionKey,
    processInstanceBusinessKey: businessKey,
  };
  const { data: incidents } = await client.get<CamundaIncident[]>('/history/incident', {
    params: incidentParams,
  });

  if (incidents.length > 0) {
    return completedResult(
      'camunda',
      true,
      `Found ${incidents.length} Camunda incident(s) for business key "${businessKey}": ${incidents
        .map((i) => i.incidentType)
        .join(', ')}.`,
      `GET /history/incident?${new URLSearchParams(incidentParams as any).toString()} -> ${incidents.length} result(s)`,
      'high',
      { query: incidentParams, incidents, incidentIds: incidents.map((i) => i.id) }
    );
  }

  const instanceParams = {
    processDefinitionKey: env.camunda.processDefinitionKey,
    businessKey,
    unfinished: true,
  };
  const { data: unfinished } = await client.get<CamundaProcessInstance[]>('/history/process-instance', {
    params: instanceParams,
  });

  if (unfinished.length > 0) {
    return completedResult(
      'camunda',
      true,
      `Process instance ${unfinished[0].id} for business key "${businessKey}" is unfinished/stuck (started ${unfinished[0].startTime}, no end time).`,
      `GET /history/process-instance?${new URLSearchParams(instanceParams as any).toString()} -> ${unfinished.length} unfinished instance(s)`,
      'high',
      { query: instanceParams, processInstanceId: unfinished[0].id, instances: unfinished }
    );
  }

  return completedResult(
    'camunda',
    false,
    '',
    `No incidents and no unfinished process instances found for business key "${businessKey}" under process "${env.camunda.processDefinitionKey}".`,
    'high',
    { businessKey, processDefinitionKey: env.camunda.processDefinitionKey }
  );
}

const MOCK_CAMUNDA_PATTERNS = [/stuck/i, /incident/i, /process instance/i, /workflow (failed|error|stuck)/i, /camunda/i];

async function runMockCamundaCheck(ticket: RCATicketInput): Promise<StageResult> {
  const found = matchesAny(ticketText(ticket), MOCK_CAMUNDA_PATTERNS);
  return completedResult(
    'camunda',
    found,
    found ? '[MOCK] Ticket language suggests a stuck/failed workflow.' : '',
    '[MOCK] No CAMUNDA_BASE_URL configured - keyword heuristic used instead of a real API call.',
    found ? 'medium' : 'low',
    { mode: 'mock', businessKey: businessKeyFor(ticket) },
    true
  );
}

export async function checkCamundaLogs(ticket: RCATicketInput): Promise<StageResult> {
  return runStageSafely('camunda', async () => {
    if (!env.camunda.baseUrl) {
      return runMockCamundaCheck(ticket);
    }
    return runRealCamundaCheck(ticket);
  });
}
