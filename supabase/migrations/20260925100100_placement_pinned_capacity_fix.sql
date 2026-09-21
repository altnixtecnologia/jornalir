-- Fase 25 (correção pós-diagnóstico, mesma fase) — a função herdada da
-- Fase 23 só evictava não-fixadas quando a linha NOVA também era não
-- fixada; ao inserir uma fixada com as vagas não-fixadas já todas ocupadas,
-- nada evictava ninguém, e o total efetivo passava de 8 até a próxima
-- escrita não-fixada tocar o tipo. Isso viola a invariante explícita do
-- item 7 da Fase 25: "fixada ocupa vaga; total continua <= 8" a qualquer
-- momento, não só eventualmente. Corrigido unificando os dois caminhos:
-- toda inserção/atualização efetiva (fixada ou não) recalcula quantas vagas
-- não-fixadas ainda cabem, dado o novo total de fixadas, e evicta o
-- excedente imediatamente. Incremental — não altera a migration anterior
-- desta mesma fase.

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
begin
  if NEW.active is distinct from true then
    return NEW;
  end if;

  select status into v_article_status
  from public.articles
  where id = NEW.article_id;

  v_effective := v_article_status = 'published'
    and (NEW.starts_at is null or NEW.starts_at <= now());

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

  select count(*) filter (where ap.pinned)
    into v_pinned_count
    from public.article_placements ap
    join public.articles a on a.id = ap.article_id
    where ap.type = NEW.type and ap.active = true and ap.id <> NEW.id
      and (ap.starts_at is null or ap.starts_at <= now())
      and a.status = 'published';

  v_new_pinned_count := v_pinned_count + case when NEW.pinned then 1 else 0 end;

  if NEW.pinned and v_pinned_count >= v_limit then
    raise exception
      'Não é possível fixar: já existem % matéria(s) fixada(s) em %, o máximo é %.',
      v_pinned_count, NEW.type, v_limit;
  end if;

  if not NEW.pinned and v_pinned_count >= v_limit then
    raise exception
      'Todas as % vaga(s) de % já estão fixadas; não há espaço para uma nova matéria não fixada.',
      v_limit, NEW.type;
  end if;

  -- Vagas não-fixadas restantes depois desta linha: o total (fixadas +
  -- não-fixadas) nunca ultrapassa v_limit, seja NEW fixada ou não. Quando
  -- NEW é não-fixada, ela mesma ocupa uma dessas vagas (por isso o "-1"
  -- só nesse caso — as outras não-fixadas competem pelo que sobra).
  v_unpinned_allowed := greatest(
    v_limit - v_new_pinned_count - case when NEW.pinned then 0 else 1 end,
    0
  );

  with ranked as (
    select ap.id, row_number() over (order by ap.created_at desc, ap.id desc) as rn
    from public.article_placements ap
    join public.articles a on a.id = ap.article_id
    where ap.type = NEW.type and ap.active = true and ap.pinned = false and ap.id <> NEW.id
      and (ap.starts_at is null or ap.starts_at <= now())
      and a.status = 'published'
  )
  update public.article_placements
  set active = false
  where id in (select id from ranked where rn > v_unpinned_allowed);

  return NEW;
end;
$$;

comment on function public.enforce_placement_limit() is
  'Fase 25: só disputa/expulsa vaga quando a matéria já está published e a janela própria (starts_at) já chegou. Total efetivo (fixadas + não-fixadas) nunca ultrapassa o limite da posição em nenhuma escrita, seja a linha nova fixada ou não.';
