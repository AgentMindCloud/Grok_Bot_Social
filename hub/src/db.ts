import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}
export async function database(options: {
  url?: string;
  dataDir?: string;
  schema?: string;
}): Promise<Database> {
  if (options.url) {
    if (options.schema && !/^test_[a-f0-9]+$/.test(options.schema))
      throw new Error("Invalid isolated test schema");
    let connectionString = options.url;
    if (options.schema) {
      const isolatedUrl = new URL(options.url);
      isolatedUrl.searchParams.set(
        "options",
        `-c search_path=${options.schema}`,
      );
      connectionString = isolatedUrl.toString();
    }
    const pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    const wrap = (client: Pool | import("pg").PoolClient): Queryable => ({
      query: async <T extends Row>(sql: string, params?: unknown[]) => ({
        rows: (await client.query<T>(sql, params)).rows,
      }),
      exec: async (sql) => {
        await client.query(sql);
      },
    });
    return {
      ...wrap(pool),
      kind: "postgres",
      close: () => pool.end(),
      transaction: async (run) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await run(wrap(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
  }
  const pg = new PGlite(options.dataDir);
  await pg.waitReady;
  const wrap = (client: Pick<PGlite, "query" | "exec">): Queryable => ({
    query: async <T extends Row>(sql: string, params?: unknown[]) => ({
      rows: (await client.query<T>(sql, params)).rows,
    }),
    exec: async (sql) => {
      await client.exec(sql);
    },
  });
  return {
    ...wrap(pg),
    kind: "pglite",
    close: () => pg.close(),
    transaction: (run) => pg.transaction((tx) => run(wrap(tx))),
  };
}
export async function migrate(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(71423819)");
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const migrations = [
      "001_initial.sql",
      "002_mission_cancel.sql",
      "003_private_beta.sql",
    ];
    for (const [index, file] of migrations.entries()) {
      const version = index + 1;
      const found = await tx.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (found.rows.length) continue;
      await tx.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
      await tx.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        version,
      ]);
    }
  });
}
