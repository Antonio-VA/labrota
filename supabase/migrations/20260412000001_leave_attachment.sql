-- Add attachment support to leave requests
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_url text;

-- Storage bucket for leave attachments (run once)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-attachments',
  'leave-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY IF NOT EXISTS "Users can upload leave attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'leave-attachments');

CREATE POLICY IF NOT EXISTS "Users can read leave attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'leave-attachments');
