-- Etapa 2 (fechamento): referência ESTRUTURADA da assinatura criada pela
-- montagem de contratação. Substitui o marcador em `notes`.
-- Aditiva, sem apagar nem reescrever dados; assinaturas existentes ficam com
-- as duas colunas nulas. NÃO aplicar sem autorização; conferir o ledger antes.

alter table public.subscriptions
  add column if not exists composition_request_id uuid,
  add column if not exists composition_item_index smallint;

alter table public.subscriptions
  drop constraint if exists subscriptions_composition_ref_pair;
alter table public.subscriptions
  add constraint subscriptions_composition_ref_pair check (
    (composition_request_id is null and composition_item_index is null)
    or (composition_request_id is not null and composition_item_index is not null and composition_item_index >= 0)
  );

-- Proteção contra criação duplicada (retry, clique duplo, abas simultâneas):
-- o mesmo serviço da mesma contratação só existe uma vez.
create unique index if not exists subscriptions_composition_ref_key
  on public.subscriptions (composition_request_id, composition_item_index)
  where composition_request_id is not null;

comment on column public.subscriptions.composition_request_id is
  'Identificador da montagem de contratação que originou a assinatura (idempotência). Nulo em assinaturas comuns.';
comment on column public.subscriptions.composition_item_index is
  'Posição do serviço dentro da montagem de contratação (0..n). Par único com composition_request_id.';
