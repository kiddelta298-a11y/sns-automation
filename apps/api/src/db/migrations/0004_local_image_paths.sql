-- monitored_posts に画像のローカル保存パスを追加。
-- スクレイパーが Threads CDN から画像をダウンロードして保存する先のファイルパス。
-- 自動投稿時にこのパスを使って Threads に画像を添付する。
ALTER TABLE monitored_posts
  ADD COLUMN IF NOT EXISTS local_image_paths jsonb DEFAULT '[]'::jsonb;
