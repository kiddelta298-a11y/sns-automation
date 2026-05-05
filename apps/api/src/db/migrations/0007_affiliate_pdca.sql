-- アフィリエイト PDCA Phase 1: 案件マスタ・ストーリー投稿ログ・短縮URLクリック・ASPレポート

CREATE TABLE IF NOT EXISTS "affiliate_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_name" text NOT NULL,
  "asp" text NOT NULL,
  "tracking_url" text NOT NULL,
  "short_slug" text NOT NULL,
  "genre" text,
  "unit_payout" integer,
  "status" text DEFAULT 'active' NOT NULL,
  "memo" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_affiliate_links_short_slug" ON "affiliate_links" ("short_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_affiliate_links_status" ON "affiliate_links" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "posted_at" timestamp NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id"),
  "link_id" uuid REFERENCES "affiliate_links"("id"),
  "source_buzz_id" text,
  "image_path" text,
  "caption" text,
  "schedule_id" uuid,
  "note" text,
  "expired_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_story_posts_posted_at" ON "story_posts" ("posted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_story_posts_link_id" ON "story_posts" ("link_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "link_clicks" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "short_slug" text NOT NULL,
  "clicked_at" timestamp DEFAULT now() NOT NULL,
  "ip_hash" text,
  "user_agent" text,
  "referer" text,
  "utm_source" text,
  "story_post_id" uuid REFERENCES "story_posts"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_link_clicks_short_slug" ON "link_clicks" ("short_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_link_clicks_clicked_at" ON "link_clicks" ("clicked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_link_clicks_story_post_id" ON "link_clicks" ("story_post_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asp_reports" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "report_date" date NOT NULL,
  "asp" text NOT NULL,
  "link_id" uuid REFERENCES "affiliate_links"("id"),
  "clicks" integer DEFAULT 0 NOT NULL,
  "cv" integer DEFAULT 0 NOT NULL,
  "revenue" integer DEFAULT 0 NOT NULL,
  "raw_row" jsonb,
  "imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_asp_reports_unique" ON "asp_reports" ("report_date", "asp", "link_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_asp_reports_link_id" ON "asp_reports" ("link_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asp_name_mapping" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "asp" text NOT NULL,
  "raw_name" text NOT NULL,
  "link_id" uuid REFERENCES "affiliate_links"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_asp_name_mapping_unique" ON "asp_name_mapping" ("asp", "raw_name");
