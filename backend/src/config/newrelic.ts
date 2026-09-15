/**
 * Guarded New Relic APM bootstrap.
 *
 * IMPORTANT: for New Relic's Node agent to auto-instrument correctly, this module
 * must be imported as the FIRST line of the process entry point (server.ts),
 * before express/mongoose/anything else is required - the agent patches modules
 * as they're required, so anything required earlier goes uninstrumented.
 *
 * The `newrelic` package itself is intentionally NOT a project dependency (it's a
 * real APM agent with its own config file conventions, and this project doesn't
 * use it anywhere else yet). If NEW_RELIC_LICENSE_KEY is set but the package isn't
 * installed, this logs a clear warning and the app keeps booting - it does not
 * crash the process. Run `npm install newrelic` once you're ready to turn this on.
 */
import { env } from './env';

if (env.newRelic.licenseKey) {
  process.env.NEW_RELIC_LICENSE_KEY = env.newRelic.licenseKey;
  process.env.NEW_RELIC_APP_NAME = env.newRelic.appName;
  process.env.NEW_RELIC_NO_CONFIG_FILE = process.env.NEW_RELIC_NO_CONFIG_FILE || 'true';

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('newrelic');
    console.log('[startup] New Relic agent initialized');
  } catch (err) {
    console.warn(
      '[startup] NEW_RELIC_LICENSE_KEY is set but the "newrelic" package is not installed — running without New Relic. Run `npm install newrelic` to enable it.'
    );
  }
} else {
  console.warn('[startup] NEW_RELIC_LICENSE_KEY not set — running without New Relic');
}
