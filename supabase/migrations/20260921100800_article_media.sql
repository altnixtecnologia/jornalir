-- Vínculo matéria↔mídia (Parte D do Plano Mestre — multi fotos). 0 fotos
-- permitido (sem linhas), várias na galeria, no máximo 1 capa por matéria
-- (garantido por índice único parcial, não só por convenção da aplicação).

create table public.article_media (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete restrict,
  role text not null check (role in ('cover', 'gallery')),
  sort_order integer not null default 0,
  caption_override text,
  credit_override text,
  created_at timestamptz not null default now(),
  unique (article_id, media_id)
);

comment on table public.article_media is
  'Capa/galeria de uma matéria. caption_override/credit_override sobrescrevem, só para este uso, a legenda/crédito padrão da mídia (media_assets.caption/credit).';

-- No máximo 1 capa por matéria — regra de negócio garantida no banco, não
-- só na aplicação.
create unique index article_media_one_cover_per_article
  on public.article_media (article_id)
  where role = 'cover';

create index article_media_article_id_sort_idx
  on public.article_media (article_id, sort_order);
create index article_media_media_id_idx
  on public.article_media (media_id);

alter table public.article_media enable row level security;

create policy article_media_select_staff
  on public.article_media for select
  to authenticated
  using (public.is_active_staff());

create policy article_media_insert_staff
  on public.article_media for insert
  to authenticated
  with check (public.is_active_staff());

create policy article_media_update_staff
  on public.article_media for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Remover uma foto de uma matéria (trocar capa, tirar da galeria) é uma
-- operação legítima e não destrutiva no sentido do Plano Mestre (a mídia
-- em si continua existindo na biblioteca) — diferente de apagar a matéria
-- ou a mídia. Delete permitido aqui, só para staff.
create policy article_media_delete_staff
  on public.article_media for delete
  to authenticated
  using (public.is_active_staff());
