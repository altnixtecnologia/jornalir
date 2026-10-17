-- Item 5, Lote 2, Tarefa 4: proteção contra chamadas simultâneas na
-- transmissão de NFS-e. NÃO aplicada ainda.
--
-- PROBLEMA: `TransmissionService.transmit()` já impede emitir DUAS
-- notas pro mesmo rascunho (constraint UNIQUE em nfse_issued_notes.
-- draft_id), mas isso só é verificado DEPOIS de reservar um número de
-- DPS e DEPOIS de chamar a API nacional — ou seja, duas chamadas
-- concorrentes pro MESMO rascunho (ex.: duplo clique, duas abas) hoje
-- conseguem reservar DOIS números de DPS distintos e enviar as DUAS
-- transmissões, que poderiam as DUAS serem autorizadas no lado da
-- Receita antes que a constraint local rejeite a segunda inserção —
-- um duplicado fiscal real, não só um erro de banco local.
--
-- SOLUÇÃO: mesmo padrão de mutex curto e auto-expirável já usado para
-- assinatura de contratos (claim_signature_turn/release_signature_turn,
-- ver 20261029100600_contract_multi_signer.sql) — reivindicado ANTES
-- de reservar o número de DPS, liberado depois de registrar a
-- tentativa (sucesso, rejeição OU "uncertain"). Nunca trava
-- permanentemente: expira em 2 minutos (tempo generoso pro ciclo
-- completo de assinar+transmitir+interpretar a resposta real).
alter table public.nfse_drafts
  add column if not exists transmission_locked_at timestamptz;

comment on column public.nfse_drafts.transmission_locked_at is
  'Mutex curto: marcado no início de transmit() e limpo ao registrar a tentativa (sucesso/rejeição/uncertain). Expira sozinho em 2 minutos — nunca trava o rascunho permanentemente mesmo se o processo cair no meio da transmissão.';

create or replace function public.claim_draft_transmission(p_draft_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_locked_at timestamptz;
begin
  select transmission_locked_at into v_locked_at from public.nfse_drafts
    where id = p_draft_id for update;
  if not found then raise exception 'Rascunho inexistente'; end if;
  if v_locked_at is not null and v_locked_at > now() - interval '2 minutes' then
    raise exception 'Este rascunho já está sendo transmitido agora (outra aba/tentativa em andamento). Aguarde e confira o histórico antes de tentar novamente.';
  end if;
  update public.nfse_drafts set transmission_locked_at = now() where id = p_draft_id;
end;
$$;

revoke all on function public.claim_draft_transmission(uuid) from public, anon, authenticated;
grant execute on function public.claim_draft_transmission(uuid) to service_role;

create or replace function public.release_draft_transmission(p_draft_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  update public.nfse_drafts set transmission_locked_at = null where id = p_draft_id;
end;
$$;

revoke all on function public.release_draft_transmission(uuid) from public, anon, authenticated;
grant execute on function public.release_draft_transmission(uuid) to service_role;

comment on function public.claim_draft_transmission(uuid) is
  'Reivindica o mutex de transmissão do rascunho (lança erro claro se já estiver em andamento) — chamado por TransmissionService.transmit() antes de reservar o número de DPS.';
comment on function public.release_draft_transmission(uuid) is
  'Libera o mutex — chamado depois de registrar a tentativa de transmissão (sucesso, rejeição ou uncertain), sempre, mesmo em caso de erro.';
