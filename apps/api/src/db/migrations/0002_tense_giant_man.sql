ALTER TABLE "scheduled_posts" ADD COLUMN "progress_pct" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "current_stage" varchar(50) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "screenshot_path" varchar(500);