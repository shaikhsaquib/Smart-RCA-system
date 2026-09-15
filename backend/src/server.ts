import './config/newrelic'; // must stay the first import - see config/newrelic.ts
import { createApp } from './app';
import { connectMongoIfConfigured } from './config/db';
import { checkCamundaConfigOrWarn } from './config/camunda';
import { env } from './config/env';

async function main() {
  checkCamundaConfigOrWarn();
  await connectMongoIfConfigured();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Smart RCA backend listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
