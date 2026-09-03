export interface D1Result<T = Record<string, unknown>> {
  readonly meta: {readonly changes?: number};
  readonly results: readonly T[];
  readonly success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: readonly unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  batch<T = Record<string, unknown>>(
    statements: readonly D1PreparedStatement[]
  ): Promise<readonly D1Result<T>[]>;
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  readonly DB: D1Database;
  readonly STRIPE_PUBLISHABLE_KEY?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_WEBHOOK_SECRET?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledControllerLike {
  readonly scheduledTime: number;
}
