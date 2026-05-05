-- accounts テーブルにアフィリエイトリンク設定を追加。
-- - affiliate_url: 投稿時にプロフィールリンク／ストーリーリンクスタンプ／キャプション末尾に使うURL
-- - affiliate_label: リンクのボタン文言（プロフィールリンク機能のCTA、ストーリーリンクスタンプの表示文字）
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS affiliate_url text,
  ADD COLUMN IF NOT EXISTS affiliate_label varchar(60);
