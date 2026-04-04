import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Worker用のDB接続（schema は動的import でAPIから参照）
const DATABASE_URL = process.env.DATABASE_URL ?? "";

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    _sql = postgres(DATABASE_URL);
    _db = drizzle(_sql);
  }
  return _db;
}

export async function closeDb() {
  await _sql?.end();
  _sql = null;
  _db = null;
}
