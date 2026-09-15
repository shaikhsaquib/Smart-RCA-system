import axios, { AxiosInstance } from 'axios';
import { env } from './env';

let cachedClient: AxiosInstance | null = null;
let warned = false;

export function isCamundaEnabled(): boolean {
  return Boolean(env.camunda.baseUrl);
}

/**
 * Logs the same "not configured" warning startup emits for Mongo/New Relic, the
 * first time anything asks. Call once at boot so the warning always appears even
 * if no route touches Camunda during this run.
 */
export function checkCamundaConfigOrWarn(): void {
  if (!isCamundaEnabled() && !warned) {
    console.warn('[startup] CAMUNDA_BASE_URL not set — running without Camunda');
    warned = true;
  } else if (isCamundaEnabled()) {
    console.log('[startup] Camunda client configured');
  }
}

/** Lazily builds (and caches) the Camunda REST client. Returns null if not configured. */
export function getCamundaClient(): AxiosInstance | null {
  if (!isCamundaEnabled()) return null;
  if (!cachedClient) {
    cachedClient = axios.create({
      baseURL: env.camunda.baseUrl,
      timeout: 10000,
      auth:
        env.camunda.authUsername && env.camunda.authPassword
          ? { username: env.camunda.authUsername, password: env.camunda.authPassword }
          : undefined,
    });
  }
  return cachedClient;
}
