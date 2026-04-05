CREATE TABLE "account_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"followers" integer,
	"following" integer,
	"total_posts" integer
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(20) NOT NULL,
	"username" varchar(100) NOT NULL,
	"display_name" varchar(200),
	"credentials" jsonb NOT NULL,
	"proxy_config" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"utm_term" varchar(100) NOT NULL,
	"description" text,
	"template_text" text,
	"category" varchar(50),
	"win_rate" numeric(5, 4),
	CONSTRAINT "appeal_patterns_utm_term_unique" UNIQUE("utm_term")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"utm_campaign" varchar(100) NOT NULL,
	"start_date" date,
	"end_date" date,
	"goal_registrations" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	CONSTRAINT "campaigns_utm_campaign_unique" UNIQUE("utm_campaign")
);
--> statement-breakpoint
CREATE TABLE "click_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"redirect_link_id" uuid NOT NULL,
	"clicked_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" varchar(500),
	"referer" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "collection_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"target_count" integer DEFAULT 500 NOT NULL,
	"collected_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"campaign_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"utm_source" varchar(50),
	"utm_content" varchar(100),
	"utm_term" varchar(100),
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "generated_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"pattern_id" uuid,
	"content_text" text NOT NULL,
	"post_format" varchar(30),
	"rationale" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"post_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "industries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"media_type" varchar(20) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"alt_text" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"likes" integer DEFAULT 0,
	"reposts" integer DEFAULT 0,
	"replies" integer DEFAULT 0,
	"views" integer DEFAULT 0,
	"profile_visits" integer
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"campaign_id" uuid,
	"appeal_pattern_id" uuid,
	"platform" varchar(20) NOT NULL,
	"content_text" text,
	"link_url" varchar(500),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"platform_post_id" varchar(100),
	"posted_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirect_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"short_code" varchar(20) NOT NULL,
	"destination_url" varchar(1000) NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redirect_links_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"executed_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	CONSTRAINT "scheduled_posts_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "trend_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"author_username" varchar(100),
	"author_followers" integer,
	"content_text" text NOT NULL,
	"has_image" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"repost_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"buzz_score" real DEFAULT 0 NOT NULL,
	"engagement_rate" real DEFAULT 0 NOT NULL,
	"post_format" varchar(30),
	"char_count" integer DEFAULT 0 NOT NULL,
	"posted_at" timestamp,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "winning_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"analysis_report" jsonb NOT NULL,
	"summary" text NOT NULL,
	"format_distribution" jsonb,
	"optimal_char_range" jsonb,
	"optimal_hours" jsonb,
	"top_post_samples" jsonb,
	"sample_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_metrics" ADD CONSTRAINT "account_metrics_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_redirect_link_id_redirect_links_id_fk" FOREIGN KEY ("redirect_link_id") REFERENCES "public"."redirect_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_job_id_collection_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_pattern_id_winning_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."winning_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_appeal_pattern_id_appeal_patterns_id_fk" FOREIGN KEY ("appeal_pattern_id") REFERENCES "public"."appeal_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirect_links" ADD CONSTRAINT "redirect_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_posts" ADD CONSTRAINT "trend_posts_job_id_collection_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_posts" ADD CONSTRAINT "trend_posts_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_job_id_collection_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_click_events_link_clicked" ON "click_events" USING btree ("redirect_link_id","clicked_at");--> statement-breakpoint
CREATE INDEX "idx_click_events_clicked_at" ON "click_events" USING btree ("clicked_at");--> statement-breakpoint
CREATE INDEX "idx_collection_jobs_industry_status" ON "collection_jobs" USING btree ("industry_id","status");--> statement-breakpoint
CREATE INDEX "idx_collection_jobs_created" ON "collection_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_post_type" ON "conversion_events" USING btree ("post_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_occurred" ON "conversion_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_generated_drafts_job" ON "generated_drafts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_generated_drafts_status" ON "generated_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_post_metrics_post_collected" ON "post_metrics" USING btree ("post_id","collected_at");--> statement-breakpoint
CREATE INDEX "idx_posts_account_status" ON "posts" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_posts_platform_posted" ON "posts" USING btree ("platform","posted_at");--> statement-breakpoint
CREATE INDEX "idx_posts_campaign" ON "posts" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_redirect_links_short_code" ON "redirect_links" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "idx_scheduled_posts_status_scheduled" ON "scheduled_posts" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_trend_posts_job" ON "trend_posts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_trend_posts_industry_buzz" ON "trend_posts" USING btree ("industry_id","buzz_score");--> statement-breakpoint
CREATE INDEX "idx_trend_posts_industry_collected" ON "trend_posts" USING btree ("industry_id","collected_at");--> statement-breakpoint
CREATE INDEX "idx_winning_patterns_industry" ON "winning_patterns" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "idx_winning_patterns_job" ON "winning_patterns" USING btree ("job_id");