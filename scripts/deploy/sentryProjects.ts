import {
  type DiagnosticsConfig,
  validConfig,
} from '../../packages/diagnostics/src/config';

// Public ingestion keys; upload credentials live only in SENTRY_AUTH_TOKEN.
const projects = {
  staging: {
    web: 'https://ab4bfc5dfba542d62ef208384f634ad9@o4504507199455232.ingest.us.sentry.io/4512305631592448',
    api: 'https://b470432aaaa61a026827aa13660f33a3@o4504507199455232.ingest.us.sentry.io/4512305631723520',
  },
  production: {
    web: 'https://135ba07e6a1cd4e464df4daa3ce60cd4@o4504507199455232.ingest.us.sentry.io/4512305631657984',
    api: 'https://dedce65374ac83eff79e7c5955419067@o4504507199455232.ingest.us.sentry.io/4512305631789056',
  },
};

export function sentryConfig(
  environment: DiagnosticsConfig['environment'],
  runtime: DiagnosticsConfig['runtime'],
  commit: string
): DiagnosticsConfig {
  const config = {
    dsn: projects[environment][runtime],
    environment,
    runtime,
    release: `devopsrockstars-${runtime}@${commit}`,
  };
  if (!validConfig(config))
    throw new Error('Sentry requires a full deployment commit and hosted DSN');
  return config;
}
