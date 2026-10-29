import {Database, type SQLQueryBindings} from 'bun:sqlite';
import path from 'node:path';
import type {D1Database, D1PreparedStatement, D1Result} from './types';

// Runs the production migrations in an in-memory SQLite database behind the
// subset of the D1 binding that the Worker and Better Auth use, including
// batch transactions. Better Auth recognizes D1 by its exec method.
export async function testDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const directory = path.join(import.meta.dir, '../migrations');
  for (const migration of Array.from(
    new Bun.Glob('*.sql').scanSync(directory)
  ).sort())
    sqlite.exec(await Bun.file(path.join(directory, migration)).text());

  const changes = () =>
    (sqlite.query('SELECT changes() AS n').get() as {n: number}).n;
  const execute = <T>(sql: string, values: SQLQueryBindings[]) => {
    const results = sqlite.query(sql).all(...values) as T[];
    return {meta: {changes: changes(), last_row_id: 0}, results, success: true};
  };

  class Statement implements D1PreparedStatement {
    constructor(
      readonly sql: string,
      readonly values: SQLQueryBindings[] = []
    ) {}

    bind(...values: readonly unknown[]) {
      if (values.length > 100)
        throw new Error('D1 bound parameter limit exceeded');
      return new Statement(this.sql, values as SQLQueryBindings[]);
    }

    async first<T>() {
      return (sqlite.query(this.sql).get(...this.values) as T | null) ?? null;
    }

    async all<T>(): Promise<D1Result<T>> {
      return execute<T>(this.sql, this.values);
    }

    async run<T>(): Promise<D1Result<T>> {
      return execute<T>(this.sql, this.values);
    }
  }

  const db = {
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return {count: 1, duration: 0};
    },
    prepare: (sql: string) => new Statement(sql),
    batch: async <T>(statements: D1PreparedStatement[]) =>
      sqlite.transaction(() =>
        statements.map(statement => {
          if (!(statement instanceof Statement))
            throw new Error('batch received a statement from another database');
          return execute<T>(statement.sql, statement.values);
        })
      )(),
  } satisfies D1Database;
  return {db, sqlite};
}
