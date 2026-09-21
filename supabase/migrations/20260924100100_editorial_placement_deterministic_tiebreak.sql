-- Fase 23 (correção pós-teste, mesma sessão) — a rotação automática já
-- ordenava por created_at desc, mas sem critério de desempate: em teste
-- real contra o banco, inserções dentro da mesma transação (mesmo lote)
-- recebem o MESMO created_at (now() é estável por transação no Postgres),
-- e o "row_number() over (order by created_at desc)" sem desempate vira
-- não determinístico entre empates — violando a exigência explícita de
-- "usar ordenação determinística, não depender da ordem incidental".
--
-- Correção: acrescenta `id desc` como critério de desempate secundário.
-- Como os ids são gen_random_uuid() (não sequenciais), isso não implica
-- "mais recente" de verdade em caso de empate real de timestamp — só
-- garante que o resultado é sempre o MESMO todas as vezes (determinístico),
-- que é a garantia pedida. Incremental — não altera nenhuma migration
-- anterior, inclusive a de minutos atrás desta mesma fase; só substitui o
-- corpo da função já criada.

create or replace function public.enforce_placement_limit()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_pinned_count integer;
  v_lock_key bigint;
begin
  if NEW.active is distinct from true then
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
    return NEW;
  end if;

  if v_pinned_count >= v_limit then
    raise exception
      'Todas as % vaga(s) de % já estão fixadas; não há espaço para uma nova matéria não fixada.',
      v_limit, NEW.type;
  end if;

  with ranked as (
    select id, row_number() over (order by created_at desc, id desc) as rn
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
  'Rotação automática e determinística por posição editorial (8/3/7/4): ordena por created_at desc, id desc (desempate determinístico quando duas linhas têm o mesmo created_at — ex.: inseridas na mesma transação). Fixadas nunca evictadas mas sempre ocupam vaga; excesso de não fixadas volta para active=false (nunca DELETE, nunca altera articles). Trava por tipo evita ultrapassar o limite sob concorrência.';
