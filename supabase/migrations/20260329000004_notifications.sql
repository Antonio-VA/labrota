-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text        NOT NULL DEFAULT 'info',
  title           text        NOT NULL,
  message         text        NOT NULL DEFAULT '',
  data            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read            boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Allow server actions to insert (via RLS bypass with service role)
-- No INSERT policy needed since we use admin client for creation
