-- Track how each rota was generated
ALTER TABLE rotas ADD COLUMN IF NOT EXISTS generation_type text;
