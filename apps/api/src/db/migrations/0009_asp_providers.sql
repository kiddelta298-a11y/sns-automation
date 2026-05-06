-- ASPの選択肢をユーザー管理できるようにするマスタテーブル
CREATE TABLE IF NOT EXISTS "asp_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(60) NOT NULL,
  "created_at" timestamp DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_asp_providers_name" ON "asp_providers" ("name");
--> statement-breakpoint
-- 初期値（よく使う日本のASP）
INSERT INTO "asp_providers" ("name") VALUES
  ('A8.net'), ('バリューコマース'), ('afb'), ('もしもアフィリエイト'),
  ('アクセストレード'), ('レントラックス'), ('felmat'), ('TCS'), ('JANet'),
  ('Amazonアソシエイト'), ('楽天アフィリエイト')
ON CONFLICT (name) DO NOTHING;
