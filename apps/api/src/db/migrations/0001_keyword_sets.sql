-- keyword_sets テーブル追加
CREATE TABLE IF NOT EXISTS "keyword_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "keywords" jsonb NOT NULL DEFAULT '[]',
  "min_keyword_match" integer NOT NULL DEFAULT 1,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- collection_jobs.industry_id を nullable に変更
ALTER TABLE "collection_jobs"
  ALTER COLUMN "industry_id" DROP NOT NULL;

-- collection_jobs に keyword_set_id を追加
ALTER TABLE "collection_jobs"
  ADD COLUMN IF NOT EXISTS "keyword_set_id" uuid REFERENCES "keyword_sets"("id");

-- インデックス
CREATE INDEX IF NOT EXISTS "idx_collection_jobs_keyword_set"
  ON "collection_jobs" ("keyword_set_id", "status");

-- trend_posts に keyword_set_id を追加
ALTER TABLE "trend_posts"
  ALTER COLUMN "industry_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "keyword_set_id" uuid REFERENCES "keyword_sets"("id");

-- winning_patterns に keyword_set_id を追加
ALTER TABLE "winning_patterns"
  ALTER COLUMN "industry_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "keyword_set_id" uuid REFERENCES "keyword_sets"("id");
