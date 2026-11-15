-- NFS-e: observacoes fiscais e pedido como dados independentes das notas internas.
-- Migration aditiva: nao reescreve rascunhos existentes, nem notas autorizadas.
-- A aplicacao continua com NFSE_AVAILABLE_IN_THIS_RELEASE=false.
-- Limites de TCInfoCompl: xInfComp (TSDescInfCompl <= 2000) / xPed (TSNumeroEndereco <= 60).

alter table public.nfse_issuer_configs
  add column if not exists default_fiscal_observation text;

alter table public.nfse_drafts
  add column if not exists fiscal_observation text,
  add column if not exists purchase_order_number text;

comment on column public.nfse_issuer_configs.default_fiscal_observation
  is 'Texto padrao opcional de serv/infoCompl/xInfComp somente para novos rascunhos; nao reescreve notas antigas.';
comment on column public.nfse_drafts.fiscal_observation
  is 'Snapshot fiscal editavel por nota, exportado para serv/infoCompl/xInfComp. Nao confundir com notes interno.';
comment on column public.nfse_drafts.purchase_order_number
  is 'Pedido ou ordem de compra/servico opcional da nota, exportado para serv/infoCompl/xPed.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nfse_issuer_observation_2000') then
    alter table public.nfse_issuer_configs
      add constraint nfse_issuer_observation_2000
      check (default_fiscal_observation is null or char_length(btrim(default_fiscal_observation)) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nfse_draft_observation_2000') then
    alter table public.nfse_drafts
      add constraint nfse_draft_observation_2000
      check (fiscal_observation is null or char_length(btrim(fiscal_observation)) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nfse_draft_order_60') then
    alter table public.nfse_drafts
      add constraint nfse_draft_order_60
      check (purchase_order_number is null or char_length(btrim(purchase_order_number)) <= 60);
  end if;
end;
$$;

-- Reutiliza o guard fiscal transacional EXISTENTE; trigger separado
-- apenas para campos novos evita recriar as protecoes preexistentes.
-- UPDATE quando claim/pendencia/incerteza/emissao continua bloqueado,
-- inclusive se tentarem bypass por Data API (sem passar pela UI).
drop trigger if exists nfse_draft_additional_info_guard on public.nfse_drafts;
create trigger nfse_draft_additional_info_guard
before update of fiscal_observation, purchase_order_number
on public.nfse_drafts
for each row
execute function public.guard_nfse_draft_fiscal_edit();
