// The subset of Cloudflare's D1 binding types that this Worker and Better Auth
// use. It matches the real binding, so Better Auth accepts `env.DB` directly:
// D1 always reports `changes` and `last_row_id`, returns mutable result
// arrays, and has `exec`, which Better Auth uses to recognize a D1 database.
export interface D1Result<T = Record<string, unknown>> {
  readonly meta: {readonly changes: number; readonly last_row_id: number};
  readonly results: T[];
  readonly success: boolean;
}

interface D1ExecResult {
  readonly count: number;
  readonly duration: number;
}

export interface D1PreparedStatement {
  bind(...values: readonly unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[]
  ): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  prepare(query: string): D1PreparedStatement;
}

export interface RateLimit {
  limit(input: {readonly key: string}): Promise<{readonly success: boolean}>;
}

export interface Env {
  readonly BETTER_AUTH_SECRET?: string;
  readonly CHECKOUT_RATE_LIMITER?: RateLimit;
  readonly CHECKOUT_HASH_SECRET?: string;
  readonly DB: D1Database;
  readonly STRIPE_PUBLISHABLE_KEY?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  readonly STOREFRONT_ORIGINS?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledControllerLike {
  readonly scheduledTime: number;
}
