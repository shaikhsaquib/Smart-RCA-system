import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-rca',

  jiraBaseUrl: process.env.JIRA_BASE_URL || '',
  jiraEmail: process.env.JIRA_EMAIL || '',
  jiraApiToken: process.env.JIRA_API_TOKEN || '',
  jiraDefaultJql:
    process.env.JIRA_DEFAULT_JQL ||
    'project = SUPPORT AND component = "Supplier" AND created >= -90d',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',

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
