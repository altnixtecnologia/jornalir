-- "Mais destaques" (localSpotlight) passa de 4 para 6 vagas simultâneas
-- (revisão de layout: grid 3×2 no site e no painel). Única mudança
-- funcional: o limite em si. Corpo da função idêntico ao de
-- 20261010100000_pinning_all_placements_and_expiry.sql — mesmas regras de
-- fixação, expiração da fixação, rotação/expulsão das mais antigas e
-- comportamento de matéria publicada/agendada.

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
    when 'localSpotlight' then 6
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
  'Fixadas ativas ocupam vagas em qualquer posição. Ao vencer ends_at, deixam de ser fixadas e voltam à rotação normal; total visível continua limitado a 8/3/7/6.';
