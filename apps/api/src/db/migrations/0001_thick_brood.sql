CREATE TABLE "account_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_account_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"followers_count" integer,
	"following_count" integer,
	"posts_count" integer,
	"daily_posts_count" integer DEFAULT 0,
	"total_likes" integer DEFAULT 0,
	"total_impressions" integer DEFAULT 0,
	"total_reposts" integer DEFAULT 0,
	"total_replies" integer DEFAULT 0,
	"engagement_rate" real,
	"top_post_buzz_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adult_genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"buzz_thresholds" jsonb DEFAULT '{"minLikes":0,"minViews":0,"minReplies":0,"minReposts":0}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buzz_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_id" uuid,
	"keyword_set_id" uuid,
	"keyword" varchar(100) NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"total_buzz_score" real DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"avg_buzz_score" real DEFAULT 0 NOT NULL,
	"job_count" integer DEFAULT 0 NOT NULL,
	"win_score" real DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collected_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"keyword_set_id" uuid,
	"keyword" varchar(200),
	"author_username" varchar(100),
	"content_text" text,
	"image_url" text NOT NULL,
	"local_path" varchar(500),
	"like_count" integer DEFAULT 0,
	"buzz_score" real DEFAULT 0,
	"analysis_text" text,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genre_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genre_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"scraped_posts_count" integer DEFAULT 0,
	"profile_json" jsonb,
	"raw_posts" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_keyword_match" integer DEFAULT 1 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_account_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"platform_post_id" varchar(300),
	"content_text" text NOT NULL,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"has_image" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"repost_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"buzz_score" real DEFAULT 0 NOT NULL,
	"posted_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_snapshot_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"platform" text NOT NULL,
	"content" text,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitored_post_id" uuid NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"repost_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"buzz_score" real DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"genre_id" uuid NOT NULL,
	"username" varchar(100) NOT NULL,
	"platform" varchar(20) DEFAULT 'threads' NOT NULL,
	"notes" text,
	"account_created_at" varchar(50),
	"account_age_months" integer,
	"followers_count" integer,
	"bio" text,
	"posts_count" integer,
	"last_profile_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "similar_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_account_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"username" varchar(100) NOT NULL,
	"platform" varchar(20) DEFAULT 'threads' NOT NULL,
	"followers_count" integer,
	"bio" text,
	"similarity_score" real DEFAULT 0,
	"similarity_reason" text,
	"is_added" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_jobs" ALTER COLUMN "industry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_posts" ALTER COLUMN "industry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "winning_patterns" ALTER COLUMN "industry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD COLUMN "keyword_set_id" uuid;--> statement-breakpoint
ALTER TABLE "trend_posts" ADD COLUMN "keyword_set_id" uuid;--> statement-breakpoint
ALTER TABLE "trend_posts" ADD COLUMN "platform_post_id" varchar(300);--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD COLUMN "keyword_set_id" uuid;--> statement-breakpoint
ALTER TABLE "account_daily_snapshots" ADD CONSTRAINT "account_daily_snapshots_reference_account_id_reference_accounts_id_fk" FOREIGN KEY ("reference_account_id") REFERENCES "public"."reference_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_daily_snapshots" ADD CONSTRAINT "account_daily_snapshots_genre_id_adult_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."adult_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_group_members" ADD CONSTRAINT "account_group_members_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_group_members" ADD CONSTRAINT "account_group_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzz_keywords" ADD CONSTRAINT "buzz_keywords_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzz_keywords" ADD CONSTRAINT "buzz_keywords_keyword_set_id_keyword_sets_id_fk" FOREIGN KEY ("keyword_set_id") REFERENCES "public"."keyword_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collected_images" ADD CONSTRAINT "collected_images_job_id_collection_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."collection_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collected_images" ADD CONSTRAINT "collected_images_keyword_set_id_keyword_sets_id_fk" FOREIGN KEY ("keyword_set_id") REFERENCES "public"."keyword_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre_profiles" ADD CONSTRAINT "genre_profiles_genre_id_adult_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."adult_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_posts" ADD CONSTRAINT "monitored_posts_reference_account_id_reference_accounts_id_fk" FOREIGN KEY ("reference_account_id") REFERENCES "public"."reference_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_posts" ADD CONSTRAINT "monitored_posts_genre_id_adult_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."adult_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_score_snapshots" ADD CONSTRAINT "post_score_snapshots_monitored_post_id_monitored_posts_id_fk" FOREIGN KEY ("monitored_post_id") REFERENCES "public"."monitored_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_accounts" ADD CONSTRAINT "reference_accounts_genre_id_adult_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."adult_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similar_accounts" ADD CONSTRAINT "similar_accounts_reference_account_id_reference_accounts_id_fk" FOREIGN KEY ("reference_account_id") REFERENCES "public"."reference_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similar_accounts" ADD CONSTRAINT "similar_accounts_genre_id_adult_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."adult_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_daily_snapshots_account_date" ON "account_daily_snapshots" USING btree ("reference_account_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_account_daily_snapshots_genre_date" ON "account_daily_snapshots" USING btree ("genre_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_daily_snapshots_unique" ON "account_daily_snapshots" USING btree ("reference_account_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_group_members_unique" ON "account_group_members" USING btree ("group_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_buzz_keyword_industry" ON "buzz_keywords" USING btree ("industry_id","keyword");--> statement-breakpoint
CREATE INDEX "idx_buzz_keywords_winscore" ON "buzz_keywords" USING btree ("industry_id","win_score");--> statement-breakpoint
CREATE INDEX "idx_buzz_keywords_lastseen" ON "buzz_keywords" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_collected_images_job" ON "collected_images" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_collected_images_keyword_set" ON "collected_images" USING btree ("keyword_set_id");--> statement-breakpoint
CREATE INDEX "idx_monitored_posts_genre" ON "monitored_posts" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "idx_monitored_posts_account" ON "monitored_posts" USING btree ("reference_account_id");--> statement-breakpoint
CREATE INDEX "idx_monitored_posts_buzz" ON "monitored_posts" USING btree ("genre_id","buzz_score");--> statement-breakpoint
CREATE INDEX "idx_post_history_job_id" ON "post_history" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_post_history_status" ON "post_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_post_history_scheduled_at" ON "post_history" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_post_score_snapshots_post" ON "post_score_snapshots" USING btree ("monitored_post_id");--> statement-breakpoint
CREATE INDEX "idx_post_score_snapshots_at" ON "post_score_snapshots" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_similar_accounts_genre" ON "similar_accounts" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "idx_similar_accounts_ref" ON "similar_accounts" USING btree ("reference_account_id");--> statement-breakpoint
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_keyword_set_id_keyword_sets_id_fk" FOREIGN KEY ("keyword_set_id") REFERENCES "public"."keyword_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_posts" ADD CONSTRAINT "trend_posts_keyword_set_id_keyword_sets_id_fk" FOREIGN KEY ("keyword_set_id") REFERENCES "public"."keyword_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_keyword_set_id_keyword_sets_id_fk" FOREIGN KEY ("keyword_set_id") REFERENCES "public"."keyword_sets"("id") ON DELETE no action ON UPDATE no action;