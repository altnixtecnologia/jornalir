-- NFS-e (PARTE B): fila automática de entrega por e-mail. NAO aplicar até a liberação da emissão fiscal.
-- Cria o schema interno, a função e o TRIGGER AFTER INSERT em public.nfse_issued_notes (só notas de produção).
-- Requer a PARTE A (20261122340650_nfse_delivery_history_tables.sql), que cria nfse_delivery_attempts.
-- NAO aplicar no Supabase oficial sem autorização. Ao aplicar, registrar a versão real do ledger.
-- Reversão: drop trigger if exists nfse_queue_delivery_on_authorization on public.nfse_issued_notes;
--           drop function if exists nfse_internal.enqueue_automatic_note_delivery(); drop schema if exists nfse_internal;

set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.nfse_delivery_attempts') is null then
    raise exception 'Aplicar antes a PARTE A (20261122340650_nfse_delivery_history_tables.sql).';
  end if;
end $$;

create schema if not exists nfse_internal;
revoke all on schema nfse_internal from public, anon, authenticated;

-- O enfileiramento fiscal NAO depende do e-mail responder nem do R2.
-- O trigger captura o e-mail fiscal no momento da autorizacao da nota,
-- com fallback ao principal. Se falhar, jamais reverte a nota autorizada.
create or replace function nfse_internal.enqueue_automatic_note_delivery()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_email text;
begin
  if new.environment <> 'production' then return new; end if;
  select coalesce(nullif(btrim(fiscal_email),''),nullif(btrim(email),''))
    into v_email from public.clients where id=new.client_id;
  insert into public.nfse_delivery_attempts
    (issued_note_id,channel,origin,status,recipient_snapshot)
  values (new.id,'email','automatic',
    'queued', -- arquivar XML/PDF mesmo sem destinatario; worker marca missing_recipient depois
    v_email)
  on conflict do nothing;
  return new;
exception when others then
  -- A emissao foi autorizada externamente: nao destruir o registro fiscal.
  raise warning 'Falha ao enfileirar entrega da NFS-e (SQLSTATE %)', SQLSTATE;
  return new;
end;
$$;
revoke all on function nfse_internal.enqueue_automatic_note_delivery()
  from public, anon, authenticated;
drop trigger if exists nfse_queue_delivery_on_authorization on public.nfse_issued_notes;
create trigger nfse_queue_delivery_on_authorization
after insert on public.nfse_issued_notes
for each row execute function nfse_internal.enqueue_automatic_note_delivery();
