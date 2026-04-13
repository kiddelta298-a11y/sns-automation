-- buzz_keywords ナレッジテーブル追加
CREATE TABLE IF NOT EXISTS "buzz_keywords" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "industry_id" uuid REFERENCES "industries"("id"),
  "keyword_set_id" uuid REFERENCES "keyword_sets"("id"),
  "keyword" varchar(100) NOT NULL,
  "occurrences" integer NOT NULL DEFAULT 0,
  "total_buzz_score" real NOT NULL DEFAULT 0,
  "post_count" integer NOT NULL DEFAULT 0,
  "avg_buzz_score" real NOT NULL DEFAULT 0,
  "job_count" integer NOT NULL DEFAULT 0,
  "win_score" real NOT NULL DEFAULT 0,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_buzz_keyword_industry"
  ON "buzz_keywords" ("industry_id", "keyword");

CREATE INDEX IF NOT EXISTS "idx_buzz_keywords_winscore"
  ON "buzz_keywords" ("industry_id", "win_score");

CREATE INDEX IF NOT EXISTS "idx_buzz_keywords_lastseen"
  ON "buzz_keywords" ("last_seen_at");
