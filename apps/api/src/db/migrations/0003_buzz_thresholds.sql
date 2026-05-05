-- adult_genres にバズ定義閾値を追加
-- グループごとに「バズとみなす最低ライン」を設定できるようにする
ALTER TABLE "adult_genres"
  ADD COLUMN IF NOT EXISTS "buzz_thresholds" jsonb NOT NULL DEFAULT '{"minLikes":0,"minViews":0,"minReplies":0,"minReposts":0}'::jsonb;
