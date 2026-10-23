import {betterAuth, type D1Database as AuthD1Database} from 'better-auth';
import {configuredOrigins} from './http';
import type {Env} from './types';

// The same administrator authentication as a2f0/ct: provisioned accounts only,
// database-backed sessions and rate limits, and no public registration.
function buildAuth(env: Env, origin: string, secret: string) {
  return betterAuth({
    appName: 'DevOps Rockstars Admin',
    baseURL: origin,
    // Better Auth detects the D1 binding and uses its native dialect.
    database: env.DB as unknown as AuthD1Database,
    secret,
    trustedOrigins: [origin, ...configuredOrigins(env.STOREFRONT_ORIGINS)],
    logger: {disabled: true},
    telemetry: {enabled: false},
    advanced: {
      database: {generateId: 'uuid'},
      ipAddress: {ipAddressHeaders: ['cf-connecting-ip']},
      cookiePrefix: 'dor-admin',
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: {httpOnly: true, sameSite: 'lax', path: '/'},
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: {modelName: 'auth_user'},
    account: {modelName: 'auth_account'},
    verification: {modelName: 'auth_verification'},
    session: {
      modelName: 'auth_session',
      expiresIn: 8 * 60 * 60,
      updateAge: 60 * 60,
      cookieCache: {enabled: false},
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'auth_rate_limit',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': {window: 60, max: 5},
        '/change-password': {window: 60, max: 5},
      },
    },
  });
}

export class AuthConfigurationError extends Error {
  constructor() {
    super('Administrator authentication is not configured');
    this.name = 'AuthConfigurationError';
  }
}

const instances = new WeakMap<
  object,
  {key: string; auth: ReturnType<typeof buildAuth>}
>();

// The Worker serves its own origin, so the auth base URL comes from the
// request instead of a separate variable that could drift from the domain.
export function createAuth(env: Env, origin: string) {
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? '';
  if (secret.length < 32) throw new AuthConfigurationError();
  const key = `${origin}\0${secret}\0${env.STOREFRONT_ORIGINS ?? ''}`;
  const existing = instances.get(env.DB);
  if (existing?.key === key) return existing.auth;
  const auth = buildAuth(env, origin, secret);
  instances.set(env.DB, {key, auth});
  return auth;
}

export type AdminSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>
>;
