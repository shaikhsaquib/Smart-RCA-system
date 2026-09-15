import dotenv from 'dotenv';

dotenv.config();

function get(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export const env = {
  buildPortal: {
    apiUrl: get('BUILD_PORTAL_API_URL'),
    apiKey: get('BUILD_PORTAL_API_KEY'),
    configSnapshotPath: get('BUILD_PORTAL_CONFIG_SNAPSHOT_PATH'),
  },
  mongo: {
    uri: get('RCA_MONGODB_URI'),
    dbName: get('RCA_MONGODB_DB_NAME') || 'supplier_platform',
    supplierCollection: get('RCA_MONGODB_SUPPLIER_COLLECTION') || 'suppliers',
  },
  camunda: {
    baseUrl: get('CAMUNDA_BASE_URL'),
    authUsername: get('CAMUNDA_AUTH_USERNAME'),
    authPassword: get('CAMUNDA_AUTH_PASSWORD'),
    processDefinitionKey: get('CAMUNDA_PROCESS_DEFINITION_KEY') || 'supplier-onboarding',
  },
  newRelic: {
    apiKey: get('NEW_RELIC_API_KEY'),
    accountId: get('NEW_RELIC_ACCOUNT_ID'),
    appName: get('NEW_RELIC_APP_NAME') || 'supplier-service',
  },
  codeDebug: {
    rootPath: get('CODE_DEBUG_ROOT_PATH'),
  },
};
