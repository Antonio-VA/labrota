-- Track when a profile's preferences were last modified so middleware can
-- refresh stale preference cookies on other devices instead of relying on a
-- one-shot `labrota_prefs_synced` marker (which left other devices stale
-- indefinitely).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences_updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION bump_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.preferences IS DISTINCT FROM OLD.preferences THEN
    NEW.preferences_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_preferences_updated_at ON profiles;
CREATE TRIGGER trg_profiles_preferences_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION bump_preferences_updated_at();
