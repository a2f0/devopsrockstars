export interface DiagnosticsConfig {
  dsn: string;
  environment: 'staging' | 'production';
  release: string;
  runtime: 'web' | 'api';
  workerBundleUrl?: string;
}

export function validConfig(config: DiagnosticsConfig): boolean {
  try {
    const url = new URL(config.dsn);
    return (
      url.protocol === 'https:' &&
      /^[a-f0-9]{32}$/u.test(url.username) &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      /^o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io$/u.test(url.hostname) &&
      /^\/\d+$/u.test(url.pathname) &&
      ['staging', 'production'].includes(config.environment) &&
      ['web', 'api'].includes(config.runtime) &&
      new RegExp(`^devopsrockstars-${config.runtime}@[a-f0-9]{40}$`, 'u').test(
        config.release
      )
    );
  } catch {
    return false;
  }
}

export function siteOriginMatches(
  origin: string,
  environment: DiagnosticsConfig['environment']
) {
  return environment === 'staging'
    ? origin === 'https://staging.devopsrockstars.com'
    : [
        'https://devopsrockstars.com',
        'https://www.devopsrockstars.com',
      ].includes(origin);
}
