-- Fixação editorial simplificada:
-- - pinned vale para qualquer posição (8/3/7/4);
-- - fixação começa quando a matéria está publicada;
-- - ends_at, quando pinned=true, encerra só a FIXAÇÃO;
-- - ao vencer, a matéria continua no fluxo normal da mesma posição;
-- - não fixadas legadas continuam respeitando starts_at/ends_at como janela.

alter table public.article_placements
  drop constraint if exists article_placements_pinned_only_main_cover;

comment on column public.article_placements.pinned is
  'Quando true, ocupa uma vaga fixa em qualquer posição editorial. ends_at opcional encerra somente a fixação; sem ends_at permanece fixa.';

create or replace function public.enforce_placement_limit()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_pinned_count integer;
  v_new_pinned_count integer;
  v_unpinned_allowed integer;
  v_lock_key bigint;
  v_article_status text;
  v_effective boolean;
  v_new_is_pinned boolean;
begin
  if NEW.active is distinct from true then
    return NEW;
  end if;

  select status into v_article_status
  from public.articles
  where id = NEW.article_id;

  -- Fixação nova começa imediatamente quando a matéria está published.
  -- starts_at continua sendo respeitado para placements legados não fixados.
  v_effective := v_article_status = 'published'
    and (
      NEW.pinned
      or NEW.starts_at is null
      or NEW.starts_at <= now()
    );

  if not v_effective then
    return NEW;
  end if;

  v_limit := case NEW.type
    when 'mainCover' then 8
    when 'highlightStrip' then 3
    when 'latestNews' then 7
    when 'localSpotlight' then 4
  end;

  v_lock_key := hashtextextended('article_placements:' || NEW.type, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  v_new_is_pinned := NEW.pinned
    and (NEW.ends_at is null or NEW.ends_at > now());

  select count(*)
    into v_pinned_count
    from public.article_placements ap
    join public.articles a on a.id = ap.article_id
    where ap.type = NEW.type
      and ap.active = true
      and ap.id <> NEW.id
      and a.status = 'published'
      and ap.pinned = true
      and (ap.ends_at is null or ap.ends_at > now());

  v_new_pinned_count :=
    v_pinned_count + case when v_new_is_pinned then 1 else 0 end;

  if v_new_is_pinned and v_pinned_count >= v_limit then
    raise exception
      'Não é possível fixar: já existem % matéria(s) fixada(s) em %, o máximo é %.',
      v_pinned_count, NEW.type, v_limit;
  end if;

  if not v_new_is_pinned and v_pinned_count >= v_limit then
    raise exception
      'Todas as % vaga(s) de % já estão fixadas; não há espaço para uma nova matéria não fixada.',
      v_limit, NEW.type;
  end if;

  v_unpinned_allowed := greatest(
    v_limit - v_new_pinned_count - case when v_new_is_pinned then 0 else 1 end,
    0
  );

  with ranked as (
    select
      ap.id,
      row_number() over (order by ap.created_at desc, ap.id desc) as rn
    from public.article_placements ap
    join public.articles a on a.id = ap.article_id
    where ap.type = NEW.type
      and ap.active = true
      and ap.id <> NEW.id
      and a.status = 'published'
      and (
        -- Não fixada legada dentro da própria janela.
        (
          ap.pinned = false
          and (ap.starts_at is null or ap.starts_at <= now())
          and (ap.ends_at is null or ap.ends_at > now())
        )
        -- Fixação vencida volta ao fluxo normal, sem sumir do destaque.
        or (
          ap.pinned = true
          and ap.ends_at is not null
          and ap.ends_at <= now()
        )
      )
  )
  update public.article_placements
  set active = false
  where id in (select id from ranked where rn > v_unpinned_allowed);

  return NEW;
end;
$$;

comment on function public.enforce_placement_limit() is
  'Fixadas ativas ocupam vagas em qualquer posição. Ao vencer ends_at, deixam de ser fixadas e voltam à rotação normal; total visível continua limitado a 8/3/7/4.';

create or replace view public.public_article_placements as
  select
    ap.article_id,
    ap.type,
    (
      ap.pinned = true
      and (ap.ends_at is null or ap.ends_at > now())
    ) as pinned,
    case
      when ap.pinned = true and (ap.ends_at is null or ap.ends_at > now())
        then ap.pinned_rank
      else null
    end as pinned_rank,
    ap.starts_at,
    ap.ends_at,
    ap.created_at
  from public.article_placements ap
  join public.articles a on a.id = ap.article_id
  where ap.active = true
    and a.status = 'published'
    and (
      -- Fixada (inclusive vencida) continua pertencendo ao destaque; se
      -- venceu, o SELECT acima a expõe como pinned=false.
      ap.pinned = true
      or (
        (ap.starts_at is null or ap.starts_at <= now())
        and (ap.ends_at is null or ap.ends_at > now())
      )
    );

grant select on public.public_article_placements to anon;

comment on view public.public_article_placements is
  'Placements públicos ativos. Fixação vencida vira fluxo normal da mesma posição, sem tirar a matéria do ar; limite/ordem são aplicados pelo provider público.';

-- Quando um agendamento é publicado pelo cron, a data deixa de ser uma
-- programação pendente. Isso evita o editor reabrir a matéria publicada
-- ainda exibindo uma data antiga no campo de programação.
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
    update public.articles
    set
      status = 'published',
      published_at = scheduled_at,
      scheduled_at = null
    where id = r.id;

    update public.article_placements
    set active = true
    where article_id = r.id and active = true;
  end loop;
end;
$$;

comment on function public.publish_due_scheduled_articles() is
  'Publica automaticamente matérias scheduled cujo horário chegou, limpa scheduled_at e reafirma o placement para reavaliar as vagas.';
