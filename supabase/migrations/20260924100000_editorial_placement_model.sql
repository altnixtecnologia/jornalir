-- Fase 23 — alinha o banco real ao modelo de destinos editoriais
-- consolidado na Fase 22 (packages/types/core/mocks). Incremental — não
-- toca nenhuma migration já aplicada (Fases 17–20). Diagnóstico prévio
-- (mesma sessão): 0 rows em articles, 0 rows em article_placements, zero
-- tipos antigos em uso — sem dado real para mapear/perder.
--
-- "none" nunca vira uma linha nesta tabela: ausência de linha ativa já
-- significa nenhuma exposição extra (desenho já existente desde a Fase 17,
-- mantido).

-- 1) Novo vocabulário de posições — só as 4 com bloco real no portal.
alter table public.article_placements drop constraint article_placements_type_check;
alter table public.article_placements
  add constraint article_placements_type_check
  check (type in ('mainCover', 'highlightStrip', 'latestNews', 'localSpotlight'));

-- 2) Fixar na capa.
alter table public.article_placements
  add column pinned boolean not null default false;

-- Declarativo, sempre válido, independente do trigger abaixo: pinned só
-- existe em mainCover.
alter table public.article_placements
  add constraint article_placements_pinned_only_main_cover
  check (not pinned or type = 'mainCover');

comment on column public.article_placements.pinned is
  'Só relevante em type=mainCover — impede a rotação automática de expulsar a matéria quando novas entram (enforce_placement_limit trigger).';

-- 3) Urgente é um selo do artigo, nunca uma posição editorial.
alter table public.articles
  add column urgent boolean not null default false;

comment on column public.articles.urgent is
  'Selo de urgência independente de placement/editoria/localidade/status (Fase 22/23 — antes era um EditorialPlacementType misturado com posição visual).';

-- 4) Limite automático por posição, reforçado no banco — espelha
-- packages/core ArticleService.enforcePlacementLimit, mas como a garantia
-- definitiva (a aplicação pode ter bugs; o banco não deveria depender só
-- dela). Trava consultiva por tipo de posição (pg_advisory_xact_lock)
-- serializa transações concorrentes que mexem no mesmo destino dentro da
-- mesma posição, evitando que duas publicações quase simultâneas leiam a
-- mesma contagem "antiga" e ultrapassem o limite juntas — a trava é
-- liberada automaticamente no fim da transação.
create or replace function public.enforce_placement_limit()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_pinned_count integer;
  v_lock_key bigint;
begin
  -- Só age quando a linha resultante está ativa. Encerrar (active=false)
  -- ou qualquer outro estado não aciona a lógica de limite/eviction.
  if NEW.active is distinct from true then
    return NEW;
  end if;

  v_limit := case NEW.type
    when 'mainCover' then 8
    when 'highlightStrip' then 3
    when 'latestNews' then 7
    when 'localSpotlight' then 4
  end;

  -- Serializa por tipo de posição — duas transações mexendo em mainCover
  -- ao mesmo tempo esperam uma pela outra aqui; nunca em highlightStrip,
  -- por exemplo, que segue em paralelo livremente.
  v_lock_key := hashtextextended('article_placements:' || NEW.type, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) filter (where pinned)
    into v_pinned_count
    from public.article_placements
    where type = NEW.type and active = true and id <> NEW.id;

  if NEW.pinned then
    if v_pinned_count >= v_limit then
      raise exception
        'Não é possível fixar: já existem % matéria(s) fixada(s) em %, o máximo é %.',
        v_pinned_count, NEW.type, v_limit;
    end if;
    -- Fixada sempre cabe (checado acima) — nunca evicta ninguém para abrir espaço.
    return NEW;
  end if;

  -- NEW não é fixada. Se todas as vagas já estão ocupadas por fixadas, não
  -- há vaga nenhuma para uma nova não fixada — falha em vez de ultrapassar
  -- o limite ou (pior) evictar uma fixada silenciosamente.
  if v_pinned_count >= v_limit then
    raise exception
      'Todas as % vaga(s) de % já estão fixadas; não há espaço para uma nova matéria não fixada.',
      v_limit, NEW.type;
  end if;

  -- Evicta (active=false, nunca DELETE) as não fixadas mais antigas em
  -- excesso — a mais recente (created_at desc) tem prioridade, ordem
  -- determinística, nunca a ordem incidental de um SELECT sem ORDER BY.
  with ranked as (
    select id, row_number() over (order by created_at desc) as rn
    from public.article_placements
    where type = NEW.type and active = true and pinned = false and id <> NEW.id
  )
  update public.article_placements
  set active = false
  where id in (select id from ranked where rn > (v_limit - v_pinned_count - 1));

  return NEW;
end;
$$;

comment on function public.enforce_placement_limit() is
  'Rotação automática e determinística por posição editorial (8/3/7/4): fixadas nunca evictadas mas sempre ocupam vaga; excesso de não fixadas volta para active=false (nunca DELETE, nunca altera articles). Trava por tipo evita ultrapassar o limite sob concorrência.';

create trigger article_placements_enforce_limit
  after insert or update on public.article_placements
  for each row
  execute function public.enforce_placement_limit();

-- RLS (Fase 17) não muda: as policies existentes já cobrem a linha inteira,
-- incluindo as colunas novas (pinned) — nenhuma policy nova necessária.
-- articles.urgent, mesma lógica.
