-- アフィリエイトリンクをアカウント単位で管理できるように account_id を追加
ALTER TABLE "affiliate_links" ADD COLUMN IF NOT EXISTS "account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "affiliate_links"
    ADD CONSTRAINT "affiliate_links_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_affiliate_links_account" ON "affiliate_links" ("account_id");
