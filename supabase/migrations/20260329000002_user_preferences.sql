-- User preferences for theme, language, appearance
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
