-- post_history に投稿URL・参照画像パスカラム追加
-- - post_url: Instagramフィード/ストーリーの投稿URL（取得できた場合）
-- - image_paths: 投稿に使った画像のローカルパス（フォルダ起点投稿で posted/failed への移動先確認用）
ALTER TABLE post_history
  ADD COLUMN IF NOT EXISTS post_url text,
  ADD COLUMN IF NOT EXISTS image_paths jsonb DEFAULT '[]'::jsonb;
