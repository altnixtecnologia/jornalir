-- Patrocinadores do site — as 6 posições laterais do portal público
-- (Fase 6 da rodada "Comercial completo"). NÃO aplicada ainda (local
-- apenas). Depende de public.media_assets (20260921100700) e
-- public.clients (20261011100000).
--
-- AUDITORIA PRÉVIA (resumo, ver relatório da tarefa): hoje as 6
-- posições são um array hardcoded em apps/site/src/components/site/
-- adSlots.ts, imagens como arquivo estático em /public/uploads/anuncios.
-- Nenhuma tabela, nenhum repository, nenhum provider existia. O pipeline
-- de media_assets + R2 (upload otimizado real, ver
-- apps/sistema/.../midias/actions.ts uploadMediaAssets) já existe e é
-- reaproveitado aqui via media_asset_id — NENHUM storage novo criado.
--
-- CONCEITUAL: isto é um BENEFÍCIO/BRINDE pra quem anuncia no jornal
-- impresso — nunca gera venda/Financeiro/NFS-e (ver commercial_sales,
-- módulo totalmente separado). client_id aqui é só "de quem é este
-- anúncio", nunca uma obrigação financeira.

-- ==================================================================
-- 1) CONFIGURAÇÃO GLOBAL — singleton por convenção de aplicação
-- (getCurrent() busca a linha mais recente, mesmo princípio de
-- nfse_issuer_configs — nunca um id fixo assumido). Um único efeito de
-- transição vale pra todos os slots (pedido explícito: não precisa
-- efeito diferente por imagem).
-- ==================================================================

create table public.site_ad_settings (
  id uuid primary key default gen_random_uuid(),

  rotation_interval_ms int not null default 10000 check (rotation_interval_ms >= 2000 and rotation_interval_ms <= 120000),
  transition_effect text not null default 'fade'
    check (transition_effect in ('fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom-in', 'zoom-out', 'blur-fade', 'scale-fade', 'crossfade')),

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_ad_settings is
  'Configuração GLOBAL de rotação/efeito dos 6 slots de patrocinadores do site — singleton por convenção de aplicação (getCurrent() busca a linha mais recente, nunca um id fixo). Um único efeito vale para todos os slots.';
create trigger site_ad_settings_set_updated_at
  before update on public.site_ad_settings
  for each row
  execute function public.set_updated_at();
alter table public.site_ad_settings enable row level security;
create policy site_ad_settings_select_staff
  on public.site_ad_settings for select
  to authenticated
  using (public.is_active_staff());
create policy site_ad_settings_insert_staff
  on public.site_ad_settings for insert
  to authenticated
  with check (public.is_active_staff());
create policy site_ad_settings_update_staff
  on public.site_ad_settings for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
-- Seed — sempre precisa existir exatamente uma linha (singleton por
-- convenção), nunca "configuração indefinida" pro site público ler.
insert into public.site_ad_settings (rotation_interval_ms, transition_effect) values (10000, 'fade');
-- Leitura pública: NUNCA via RLS direta na tabela-base (mesmo princípio
-- de public_articles/public_article_media, ver 20260930100000) — uma
-- VIEW public_site_ad_settings própria, grant explícito a anon, no
-- final deste arquivo.

-- ==================================================================
-- 2) AS 6 POSIÇÕES FIXAS — nunca criadas/removidas pela aplicação
-- depois do seed inicial abaixo; só active muda. slot_number é o
-- identificador estável (1..6), nunca o id interno.
-- ==================================================================

create table public.site_ad_slots (
  id uuid primary key default gen_random_uuid(),
  slot_number int not null unique check (slot_number between 1 and 6),
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_ad_slots is
  'As 6 posições fixas de publicidade lateral do site (3 esquerda + 3 direita no desktop; pares 1+2/3+4/5+6 no mobile — ver apps/site/src/components/site/AdSlotColumn.tsx/AdSlotPairRow.tsx, layout nunca alterado). slot_number é o identificador estável.';
create trigger site_ad_slots_set_updated_at
  before update on public.site_ad_slots
  for each row
  execute function public.set_updated_at();
alter table public.site_ad_slots enable row level security;
create policy site_ad_slots_select_staff
  on public.site_ad_slots for select
  to authenticated
  using (public.is_active_staff());
create policy site_ad_slots_update_staff
  on public.site_ad_slots for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
insert into public.site_ad_slots (slot_number) values (1), (2), (3), (4), (5), (6);
-- ==================================================================
-- 3) PLAYLIST DE CADA SLOT — várias mídias por posição, com ordem e
-- período próprios. media_asset_id reaproveita o pipeline real de
-- mídia/R2 já existente (media_assets) — NUNCA um storage/upload
-- paralelo. client_id é o "patrocinador" opcional (benefício/brinde,
-- nunca uma venda — ver comentário no topo do arquivo). Remover uma
-- linha aqui NUNCA apaga o media_asset (pode estar em uso em outro
-- lugar, ex. uma matéria) — mesmo princípio de article_media.
-- ==================================================================

create table public.site_ad_media (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.site_ad_slots (id) on delete cascade,

  media_asset_id uuid not null references public.media_assets (id),
  client_id uuid references public.clients (id),
  href text,
  alt_text text,

  active boolean not null default true,
  active_from date,
  active_until date,
  sort_order int not null default 0,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_ad_media_active_until_not_before_from check (active_from is null or active_until is null or active_until >= active_from)
);
comment on table public.site_ad_media is
  'Uma imagem dentro da playlist de um slot — media_asset_id é a mesma tabela/pipeline (R2) usada no resto do sistema, nunca um storage novo. client_id ("patrocinador") é só identificação opcional, nunca gera obrigação financeira. Remover esta linha nunca apaga o media_asset (pode estar em uso em outro lugar).';
create index site_ad_media_slot_id_idx on public.site_ad_media (slot_id);
create index site_ad_media_media_asset_id_idx on public.site_ad_media (media_asset_id);
create index site_ad_media_client_id_idx on public.site_ad_media (client_id) where client_id is not null;
create trigger site_ad_media_set_updated_at
  before update on public.site_ad_media
  for each row
  execute function public.set_updated_at();
create or replace function public.set_site_ad_media_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger site_ad_media_set_actor
  before insert on public.site_ad_media
  for each row
  execute function public.set_site_ad_media_actor();
alter table public.site_ad_media enable row level security;
create policy site_ad_media_select_staff
  on public.site_ad_media for select
  to authenticated
  using (public.is_active_staff());
create policy site_ad_media_insert_staff
  on public.site_ad_media for insert
  to authenticated
  with check (public.is_active_staff());
create policy site_ad_media_update_staff
  on public.site_ad_media for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
-- DELETE real — mesmo princípio de article_media (remover uma imagem da
-- playlist é uma operação normal e reversível pelo usuário, nunca
-- precisa de "soft delete"; o media_asset em si nunca é afetado).
create policy site_ad_media_delete_staff
  on public.site_ad_media for delete
  to authenticated
  using (public.is_active_staff());
-- ==================================================================
-- 4) LEITURA PÚBLICA — mesmo princípio EXATO de public_articles/
-- public_article_media (20260930100000): nunca RLS `to anon` direto
-- nas tabelas-base (que continuam staff-only); views próprias com
-- `grant select ... to anon`, só com as colunas que o site de fato usa.
-- Período/ativo já filtrados na própria view — o site nunca recebe
-- mídia desativada/fora do período/de slot inativo.
-- ==================================================================

create view public.public_site_ad_settings as
  select rotation_interval_ms, transition_effect
  from public.site_ad_settings
  order by updated_at desc
  limit 1;
grant select on public.public_site_ad_settings to anon;
create view public.public_site_ad_media as
  select
    s.slot_number,
    m.id,
    ma.public_url as image_url,
    coalesce(m.alt_text, ma.alt_text) as alt_text,
    m.href,
    m.sort_order
  from public.site_ad_media m
  join public.site_ad_slots s on s.id = m.slot_id and s.active = true
  join public.media_assets ma on ma.id = m.media_asset_id
  where m.active = true
    and (m.active_from is null or m.active_from <= current_date)
    and (m.active_until is null or m.active_until >= current_date)
  order by s.slot_number, m.sort_order;
grant select on public.public_site_ad_media to anon;
