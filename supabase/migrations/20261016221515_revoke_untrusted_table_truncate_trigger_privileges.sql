-- Aplicada ao Supabase site-system-ir em 2026-10-16 (migration 20261016221515).
-- Em tabelas do schema public, TRUNCATE contorna RLS e TRIGGER permite DDL indevida.
-- Revogacao defensiva retrocompativel: nao modifica SELECT/INSERT/UPDATE/DELETE,
-- politicas RLS nem os triggers existentes.
DO $$
DECLARE v_table RECORD;
BEGIN
  FOR v_table IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER ON TABLE %I.%I FROM anon, authenticated, PUBLIC',
      v_table.schema_name, v_table.table_name
    );
  END LOOP;
END $$;
