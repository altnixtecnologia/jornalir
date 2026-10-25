-- Corrige inclusão duplicada causada por duplo clique/reenvio de rede.
-- Não modifica nem apaga registros preexistentes, apenas bloqueia futuras
-- inserções/reativações que repetem nome, dia/mês e grupo de pessoa editorial.
create function public.guard_editorial_birthday_duplicate()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
 v_name text;
 v_scope text;
begin
 if new.source_client_id is not null or not new.active then return new; end if;
 v_name:=lower(regexp_replace(btrim(new.display_name),'[[:space:]]+',' ','g'));
 if v_name='' then
   raise exception 'Informe o nome do aniversariante.' using errcode='22023';
 end if;
 if TG_OP='UPDATE' then
   if old.active and old.group_client_id is not distinct from new.group_client_id
     and old.birth_month=new.birth_month and old.birth_day=new.birth_day
     and lower(regexp_replace(btrim(old.display_name),'[[:space:]]+',' ','g'))=v_name
   then return new; end if;
 end if;
 -- Uma mesma chave é serializada (inclusive sob duas sessões concorrentes).
 v_scope:=coalesce(new.group_client_id::text,'independente')||':'||
   new.birth_month::text||':'||new.birth_day::text||':'||v_name;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_scope,0));
 if exists(
   select 1 from public.birthday_entries b
   where b.id<>new.id and b.source_client_id is null and b.active
     and b.group_client_id is not distinct from new.group_client_id
     and b.birth_month=new.birth_month and b.birth_day=new.birth_day
     and lower(regexp_replace(btrim(b.display_name),'[[:space:]]+',' ','g'))=v_name
 ) then
   raise exception 'Aniversariante já cadastrado neste grupo com a mesma data.'
    using errcode='23505';
 end if;
 return new;
end;
$fn$;
revoke all on function public.guard_editorial_birthday_duplicate() from public,anon,authenticated;
create trigger zz_guard_editorial_birthday_duplicate
 before insert or update on public.birthday_entries for each row
 execute function public.guard_editorial_birthday_duplicate();
comment on function public.guard_editorial_birthday_duplicate() is
 'Evita duplicidade editorial futura por mesmo grupo/nome/dia/mês em inserts concorrentes, sem atualizar cadastros mestre ou limpar duplicatas antigas.';
