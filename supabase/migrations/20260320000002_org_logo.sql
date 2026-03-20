-- Add logo_url to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create org-logos storage bucket (public read, authenticated write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to org-logos
CREATE POLICY IF NOT EXISTS "Authenticated users can upload org logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org-logos');

-- Allow authenticated users to update org logos (upsert)
CREATE POLICY IF NOT EXISTS "Authenticated users can update org logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org-logos');

-- Allow public read of org logos
CREATE POLICY IF NOT EXISTS "Public read org logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'org-logos');
