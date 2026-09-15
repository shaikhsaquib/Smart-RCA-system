import dotenv from 'dotenv';

dotenv.config();

function get(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function getList(name: string): string[] {
  const value = get(name);
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function required(name: string): string {
  const value = get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),

  // --- MongoDB (optional at boot - see config/db.ts) ---
  mongoUri: get('MONGODB_URI'),

  // --- Jira (ticket categorization pipeline) ---
  jiraBaseUrl: get('JIRA_BASE_URL') || '',
  jiraEmail: get('JIRA_EMAIL') || '',
  jiraApiToken: get('JIRA_API_TOKEN') || '',
  jiraDefaultJql:
    get('JIRA_DEFAULT_JQL') || 'project = SUPPORT AND component = "Supplier" AND created >= -90d',

  // --- Claude API ---
  anthropicApiKey: get('ANTHROPIC_API_KEY') || '',
  anthropicModel: get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001',

  // --- New Relic (optional - see config/newrelic.ts) ---
  newRelic: {
    licenseKey: get('NEW_RELIC_LICENSE_KEY'),
    appName: get('NEW_RELIC_APP_NAME') || 'smart-rca-backend',
  },

  // --- Camunda (optional - see config/camunda.ts) ---
  camunda: {
    baseUrl: get('CAMUNDA_BASE_URL'),
    authUsername: get('CAMUNDA_AUTH_USERNAME'),
    authPassword: get('CAMUNDA_AUTH_PASSWORD'),
  },

  // --- Jira Knowledge-Base sync (Task 2) ---
  jiraKb: {
    projectKey: get('JIRA_KB_PROJECT_KEY'),
    // The JQL field reference to match JIRA_KB_COMPONENT against. Confirmed against
    // GEP's actual Jira: "Supplier Profile" is NOT a standard component/label on any
    // real ticket - it's a value of a custom single-select field ("Actionable-Team"),
    // referenced in JQL as cf[15279]. Defaults to the standard "component" field for
    // any other Jira instance where that assumption from the FSD does hold.
    matchField: get('JIRA_KB_MATCH_FIELD') || 'component',
    component: get('JIRA_KB_COMPONENT'),
    assigneeNames: getList('JIRA_KB_ASSIGNEES'),
    collectionName: get('JIRA_KB_COLLECTION') || 'jira_kb_chunks',
    vectorIndexName: get('JIRA_KB_VECTOR_INDEX') || 'jira_kb_vector_index',
    chunkSizeChars: parseInt(get('JIRA_KB_CHUNK_SIZE') || '1500', 10),
  },

  // --- Embeddings (swappable provider behind services/embeddingProvider.ts) ---
  embedding: {
    provider: (get('EMBEDDING_PROVIDER') || 'voyage') as 'voyage' | 'openai',
    voyageApiKey: get('VOYAGE_API_KEY'),
    voyageModel: get('VOYAGE_EMBEDDING_MODEL') || 'voyage-3',
    openaiApiKey: get('OPENAI_API_KEY'),
    openaiModel: get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
  },

  getRequiredJiraConfig() {
    return {
      baseUrl: required('JIRA_BASE_URL'),
      email: required('JIRA_EMAIL'),
      apiToken: required('JIRA_API_TOKEN'),
    };
  },

  getRequiredAnthropicKey() {
    return required('ANTHROPIC_API_KEY');
  },
};
