-- Segurança transversal: RLS nao protege TRUNCATE, nem autoriza criacao de triggers.
-- Revoga somente privilegios de DDL/destruicao que a aplicacao nao utiliza.
-- INSERT/SELECT/UPDATE e as policies existentes permanecem intocados.
do $$
declare v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke truncate, trigger on table %I.%I from anon, authenticated, public',
      v_table.schema_name, v_table.table_name
    );
  end loop;
end $$;;
