-- Change published_by from uuid to text (stores publisher name, not user ID)
ALTER TABLE public.rotas DROP CONSTRAINT IF EXISTS rotas_published_by_fkey;
ALTER TABLE public.rotas ALTER COLUMN published_by TYPE text USING published_by::text;
