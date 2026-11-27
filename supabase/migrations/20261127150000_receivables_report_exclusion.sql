-- Classificação de títulos de TESTE fora dos relatórios ativos, preservando evidência.
--
-- Somente estrutura aditiva: três colunas anuláveis em public.receivables. Esta
-- migration NÃO marca nenhum registro, não altera valores, recibos, ajustes,
-- vínculos, constraints existentes nem a view receivables_with_balance.
-- A marcação de títulos específicos é uma operação separada, com conjunto
-- explícito de IDs aprovado pelo proprietário (ver docs/operacao do corte).
--
-- Efeito esperado (aplicado pelo código, não pelo banco): títulos marcados saem de
-- listas/relatórios de contas a receber, recebimentos, ajustes, visão financeira e
-- da consulta central enviada ao Altnix Informativo. Nada é apagado e a marcação é
-- reversível (limpar as três colunas).

alter table public.receivables
  add column if not exists report_excluded_at timestamptz,
  add column if not exists report_excluded_by uuid,
  add column if not exists report_excluded_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'receivables_report_exclusion_complete'
      and conrelid = 'public.receivables'::regclass
  ) then
    alter table public.receivables
      add constraint receivables_report_exclusion_complete check (
        (report_excluded_at is null and report_excluded_by is null and report_excluded_reason is null)
        or (report_excluded_at is not null and report_excluded_by is not null
            and report_excluded_reason is not null and length(btrim(report_excluded_reason)) >= 10)
      );
  end if;
end $$;

create index if not exists receivables_report_excluded_idx
  on public.receivables (id) where report_excluded_at is not null;

comment on column public.receivables.report_excluded_at is
  'Quando o título foi classificado como teste e retirado dos relatórios ativos. Não apaga nem altera valores.';
comment on column public.receivables.report_excluded_reason is
  'Motivo obrigatório (mín. 10 caracteres) da exclusão dos relatórios; preserva a evidência do teste.';
