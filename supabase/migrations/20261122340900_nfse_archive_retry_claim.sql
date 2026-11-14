-- NFS-e (PARTE D, PENDENTE): fila justa de arquivamento R2 com claim e backoff persistente.
-- NAO aplicar no Supabase oficial sem autorizacao; requer migration A (nfse_document_assets).
-- Nenhuma emissao, e-mail ou cron e habilitado por esta migration.
-- A recuperacao e idempotente: documentos originais permanecem imutaveis.
set local lock_timeout = '3s';

create table if not exists public.nfse_archive_retry_state (
  issued_note_id uuid primary key references public.nfse_issued_notes(id) on delete restrict,
  failures integer not null default 0 check (failures >= 0),
  next_attempt_at timestamptz not null default '-infinity'::timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists nfse_archive_retry_next_idx on public.nfse_archive_retry_state(next_attempt_at);
alter table public.nfse_archive_retry_state enable row level security;
revoke all on public.nfse_archive_retry_state from public, anon, authenticated;
grant select, insert, update on public.nfse_archive_retry_state to service_role;

-- Seleciona notas autorizadas com algum documento faltante em TODO o conjunto,
-- nao apenas nas ultimas 50. Prioriza quem nunca falhou e depois menos falhas;
-- claim de 3 min impede que duas invocacoes processem o mesmo lote imediatamente.
-- SKIP LOCKED + UPSERT ocorrem na mesma transacao da RPC.
create or replace function public.claim_pending_nfse_archive(p_limit integer default 3)
returns table(note_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with candidates as materialized (
    select n.id
    from public.nfse_issued_notes n
    left join public.nfse_archive_retry_state s on s.issued_note_id = n.id
    where n.environment = 'production'
      and n.access_key is not null
      and n.nfse_xml is not null
      and (s.next_attempt_at is null or s.next_attempt_at <= now())
      and (
        select count(distinct a.kind)
        from public.nfse_document_assets a
        where a.issued_note_id = n.id
          and a.kind in ('nfse_xml','dps_xml','danfse_pdf')
      ) < 3
    order by coalesce(s.failures, 0) asc, n.created_at asc, n.id asc
    limit least(greatest(coalesce(p_limit,3),1),10)
    for update of n skip locked
  ), claimed as (
    insert into public.nfse_archive_retry_state as s
      (issued_note_id, next_attempt_at, last_attempt_at, updated_at)
    select c.id, now() + interval '3 minutes', now(), now() from candidates c
    on conflict (issued_note_id) do update
      set next_attempt_at = excluded.next_attempt_at,
          last_attempt_at = excluded.last_attempt_at,
          updated_at = excluded.updated_at
    returning s.issued_note_id
  )
  select c.issued_note_id from claimed c;
end;
$$;

-- Falha: backoff exponencial por nota (5, 10, 20... ate 1440 min).
-- Sucesso nao exige UPDATE: os 3 assets arquivados retiram a nota da consulta.
create or replace function public.defer_nfse_archive_failure(p_note_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.nfse_archive_retry_state s
  set failures = s.failures + 1,
      next_attempt_at = now() +
        (least(1440, (5 * power(2.0, least(s.failures, 8)))::integer) * interval '1 minute'),
      updated_at = now()
  where s.issued_note_id = p_note_id;
  if not found then
    raise exception 'Claim de arquivamento nao encontrado'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.claim_pending_nfse_archive(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_nfse_archive(integer) to service_role;
revoke all on function public.defer_nfse_archive_failure(uuid) from public, anon, authenticated;
grant execute on function public.defer_nfse_archive_failure(uuid) to service_role;

comment on table public.nfse_archive_retry_state is
  'Estado do arquivamento R2; retentativas com backoff para impedir bloqueio das demais NFS-e.';
comment on function public.claim_pending_nfse_archive(integer) is
  'Claim atomico de NFS-e autorizadas ainda sem os tres documentos obrigatorios no R2; somente service_role.';
