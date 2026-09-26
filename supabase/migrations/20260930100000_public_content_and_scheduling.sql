-- Fase 30 — portal público lendo o banco real. Incremental — não altera
-- nenhuma migration anterior.

-- 1) AGENDAMENTO REAL (item 2) ------------------------------------------
--
-- Limitação documentada desde a Fase 25: `scheduled` nunca virava
-- `published` sozinho. Resolvido com `pg_cron` — mecanismo automático no
-- banco, independente de alguém abrir o painel. Roda a cada minuto
-- (granularidade mínima do pg_cron), suficiente para o teste temporal
-- pedido ("horário futuro curto").
create extension if not exists pg_cron with schema extensions;

create or replace function public.publish_due_scheduled_articles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.articles
    where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
  loop
    -- 1) Publica de verdade — nunca só "parece publicado" para o público
    -- enquanto o painel ainda mostra "agendada".
    update public.articles
    set status = 'published', published_at = scheduled_at
    where id = r.id;

    -- 2) Reafirma o placement ativo (se houver) para o gatilho
    -- `enforce_placement_limit` reavaliar com o status novo — mesma
    -- técnica de `touchActivePlacement` (Fase 25), aqui automática: o
    -- gatilho só roda em INSERT/UPDATE de `article_placements`, nunca
    -- por causa de um UPDATE em `articles`, então sem este toque a
    -- disputa pela vaga 8/3/7/4 nunca aconteceria de verdade.
    update public.article_placements
    set active = true
    where article_id = r.id and active = true;
  end loop;
end;
$$;

comment on function public.publish_due_scheduled_articles() is
  'Publica automaticamente matérias scheduled cujo scheduled_at já passou, e reafirma o placement ativo para o gatilho de limite reavaliar. Agendado via pg_cron, roda a cada minuto.';

select cron.schedule(
  'publish-due-scheduled-articles',
  '* * * * *',
  $$select public.publish_due_scheduled_articles();$$
);

-- 2) CAMADA PÚBLICA SEGURA (item 3) --------------------------------------
--
-- Nunca SELECT anon irrestrito nas tabelas internas. Views expõem só o
-- necessário; o dono da view (papel usado pela migration, com privilégio
-- de ignorar RLS) faz a query real por trás — o filtro de segurança é o
-- WHERE de cada view, não a RLS das tabelas-base (que continua só para
-- `authenticated`/staff, inalterada). Testado explicitamente com cliente
-- anon nesta mesma fase.

grant usage on schema public to anon;

-- Editorias/localidades ativas — as inativas continuam existindo
-- (histórico de matérias antigas), só não aparecem como opção pública
-- nova (item 4).
create view public.public_editorial_sections as
  select id, slug, name, sort_order
  from public.editorial_sections
  where active = true
  order by sort_order;

create view public.public_localities as
  select id, slug, name, scope
  from public.localities
  where active = true
  order by name;

grant select on public.public_editorial_sections to anon;
grant select on public.public_localities to anon;

-- Matérias: só `published` — depois do mecanismo de agendamento acima,
-- "published" já significa "efetivamente publicada", nunca precisa de
-- lógica temporal extra aqui. Nenhum campo administrativo (created_by/
-- updated_by/internal_reference/notification_mode/origin) exposto —
-- só o que o portal público de fato usa (item 5).
create view public.public_articles as
  select
    id, slug, title, subtitle, title_style, subtitle_style, body,
    section_id, locality_id, urgent, published_at, created_at, updated_at
  from public.articles
  where status = 'published';

grant select on public.public_articles to anon;

-- Mídia: só a de matérias `published` — nunca a foto exclusiva de um
-- rascunho. Já resolve url/legenda/crédito (override da matéria, com
-- fallback ao padrão da mídia) — o site nunca precisa enxergar
-- `media_assets` inteiro, só o que está de fato vinculado a uma matéria
-- pública.
create view public.public_article_media as
  select
    am.article_id,
    am.media_id,
    am.role,
    am.sort_order,
    ma.public_url as url,
    ma.alt_text,
    coalesce(am.caption_override, ma.caption) as caption,
    coalesce(am.credit_override, ma.credit) as credit
  from public.article_media am
  join public.articles a on a.id = am.article_id and a.status = 'published'
  join public.media_assets ma on ma.id = am.media_id;

grant select on public.public_article_media to anon;

-- Destinos editoriais efetivos agora — já filtrado por matéria published,
-- ativo e dentro da janela (starts_at/ends_at). O corte 8/3/7/4 e a
-- ordem (fixadas por pinned_rank, demais por recência) ficam no
-- provider público do site (mesma responsabilidade de
-- `ArticleService.listActivePlacement`, só que para o público).
create view public.public_article_placements as
  select
    ap.article_id,
    ap.type,
    ap.pinned,
    ap.pinned_rank,
    ap.starts_at,
    ap.ends_at,
    ap.created_at
  from public.article_placements ap
  join public.articles a on a.id = ap.article_id
  where ap.active = true
    and a.status = 'published'
    and (ap.starts_at is null or ap.starts_at <= now())
    and (ap.ends_at is null or ap.ends_at > now());

grant select on public.public_article_placements to anon;

comment on view public.public_articles is
  'Camada pública (Fase 30) — só matérias published, só campos usados pelo portal. Nunca drafts/adjusting/scheduled futuro/archived.';
comment on view public.public_article_media is
  'Camada pública — mídia só de matérias published, já com URL/legenda/crédito resolvidos.';
comment on view public.public_article_placements is
  'Camada pública — só placements efetivos agora (published + ativo + dentro da janela). Limite 8/3/7/4 aplicado pelo provider público, não aqui.';
