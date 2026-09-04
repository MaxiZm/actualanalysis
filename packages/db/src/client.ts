import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database operations.");
  }
  const client = postgres(connectionString, { max: 5, prepare: false });
  return { db: drizzle({ client, schema }), close: () => client.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * The query surface shared by the top-level Drizzle client and a transaction.
 * Keeping write helpers on this narrower interface lets a pipeline persist a
 * complete three-index publication as one atomic unit.
 */
export type DatabaseWriter = Pick<Database, "insert" | "update">;
