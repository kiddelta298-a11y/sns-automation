import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/sns_automation";

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
