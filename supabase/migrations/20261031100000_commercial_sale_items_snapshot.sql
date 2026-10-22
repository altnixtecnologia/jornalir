-- Primeiro elo entre propostas com varios servicos e a futura contratacao unificada.
-- Preserve os ITENS da proposta como fotografia imutavel da negociacao.
-- Nao gera contrato, nao altera cobrancas e nao afeta vendas existentes.
alter table public.commercial_sales
  add column if not exists items_snapshot jsonb;

comment on column public.commercial_sales.items_snapshot is
  'Fotografia dos itens da proposta ao converter em venda: nomes, modalidades, quantidade, valor e desconto. Imutavel apos criacao; nao substituir pelo catalogo atual ao gerar futuro contrato. NULL para vendas avulsas/legadas.';

alter table public.commercial_sales
  add constraint commercial_sales_items_snapshot_array_chk
  check (
    items_snapshot is null
    or (jsonb_typeof(items_snapshot) = 'array' and jsonb_array_length(items_snapshot) > 0)
  );

-- Uma edicao posterior dos produtos/planos nunca reescreve as condicoes
-- de uma venda ja convertida. Cada alteracao contratual exigira novo
-- documento/aditivo e historico proprio em etapa futura.
create or replace function public.protect_commercial_sale_items_snapshot()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.items_snapshot is distinct from new.items_snapshot then
    raise exception 'Os itens da negociacao original nao podem ser alterados.';
  end if;
  return new;
end;
$$;

create trigger commercial_sales_immutable_items_snapshot
before update on public.commercial_sales
for each row execute function public.protect_commercial_sale_items_snapshot();
