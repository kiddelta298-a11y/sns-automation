/**
 * シンプルなマイグレーションランナー
 *
 * - migrations フォルダ配下の `*.sql` ファイルをファイル名順に走査
 * - `_applied_migrations` テーブルに記録された適用済みファイルはスキップ
 * - 各ファイルは drizzle-kit のステートメント区切り `--> statement-breakpoint` で分割して実行
 * - drizzle journal とは独立に動作するため、手書き SQL も自動で適用される
 */
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(__dirname, "./migrations"),
    path.resolve(__dirname, "../db/migrations"),
    path.resolve(__dirname, "../../src/db/migrations"),
  ];
  const migrationsFolder = candidates.find((p) => fs.existsSync(p));
  if (!migrationsFolder) {
    console.error("[migrate] migrations folder not found in:", candidates);
    process.exit(1);
  }
  console.log(`[migrate] migrations folder: ${migrationsFolder}`);

  const files = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  console.log(`[migrate] found ${files.length} migration file(s)`);

  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _applied_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    const applied = await sql<{ filename: string }[]>`SELECT filename FROM _applied_migrations`;
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }
      const fullPath = path.join(migrationsFolder, file);
      const content = fs.readFileSync(fullPath, "utf8");
      // drizzle-kit のステートメント区切り or 通常の ; で分割
      const statements = content
        .split(/-->\s*statement-breakpoint/gi)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`[migrate] applying: ${file} (${statements.length} statement(s))`);
      try {
        await sql.begin(async (tx) => {
          for (const stmt of statements) {
            const trimmed = stmt.replace(/;\s*$/, "").trim();
            if (!trimmed) continue;
            await tx.unsafe(trimmed);
          }
          await tx.unsafe(`INSERT INTO _applied_migrations (filename) VALUES ('${file.replace(/'/g, "''")}')`);
        });
        console.log(`[migrate] OK: ${file}`);
      } catch (e) {
        // 既存DBに同じテーブルが存在するパターンに耐える: 「already exists」系は記録だけして続行
        const msg = e instanceof Error ? e.message : String(e);
        if (/already exists/i.test(msg) || /duplicate/i.test(msg)) {
          console.warn(`[migrate] non-fatal (already exists): ${file} — ${msg}`);
          await sql`INSERT INTO _applied_migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`;
        } else {
          console.error(`[migrate] failed on ${file}:`, e);
          throw e;
        }
      }
    }

    console.log("[migrate] all migrations applied");
  } catch (e) {
    console.error("[migrate] aborted:", e);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

run().catch((e) => {
  console.error("[migrate] unhandled:", e);
  process.exit(1);
});
