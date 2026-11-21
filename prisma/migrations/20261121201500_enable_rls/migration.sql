-- Supabase exposes the public schema over its Data API. GhostLayer only talks to Postgres through
-- Prisma (table owner), so enable RLS with no policies: anon/authenticated API roles get no access.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
