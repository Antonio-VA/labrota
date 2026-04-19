-- Shift engine v1 has been removed from the codebase.
-- Normalize any legacy rows still set to 'v1' so every org uses v2.
-- The column is kept (not dropped) so future engine versions can plug in here.
UPDATE lab_config
SET    ai_optimal_version = 'v2'
WHERE  ai_optimal_version = 'v1';
