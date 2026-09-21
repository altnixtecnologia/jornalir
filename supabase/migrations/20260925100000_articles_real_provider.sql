-- Fase 25 — banco pronto para o provider real de Matérias. Incremental —
-- não altera nenhuma migration anterior.

-- 1) Estilos de título/subtítulo (Parte C, item 7 do Plano Mestre): o
--    editor já os expõe e edita de verdade; precisam sobreviver a um
--    refresh, não só existir em memória do formulário.
alter table public.articles
  add column title_style jsonb,
  add column subtitle_style jsonb;

comment on column public.articles.title_style is
  'EditorialTextStyle (bold/italic/size/emphasis) do título. Ausente = padrão editorial automático.';
comment on column public.articles.subtitle_style is
  'EditorialTextStyle do subtítulo. Ausente = padrão editorial automático.';

-- 2) `EditorialSection.description` é campo real, editável na tela de
--    Editorias desde a Fase 16 (não um campo do type sem uso na UI) — a
--    Fase 24 descartava esse valor silenciosamente por falta de coluna.
--    Corrigido aqui em vez de continuar perdendo o que a redação digita.
alter table public.editorial_sections
  add column description text;

-- 3) created_by/updated_by sempre a identidade real da sessão autenticada
--    — nunca um valor arbitrário vindo do cliente (Fase 25, item 4).
--    Trigger em vez de confiar só na aplicação: garante a regra mesmo se
--    algum código futuro esquecer de setar o campo, ou mandar outro id.
create or replace function public.set_article_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

comment on function public.set_article_actor() is
  'created_by/updated_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente.';

create trigger articles_set_actor
  before insert or update on public.articles
  for each row
  execute function public.set_article_actor();

-- 4) Nunca duas linhas ativas simultâneas de destino editorial para a
--    mesma matéria (Fase 25, item 6) — reforço declarativo, além da
--    disciplina do provider de sempre encerrar a linha atual antes de
--    criar uma nova.
create unique index article_placements_one_active_per_article
  on public.article_placements (article_id)
  where active;

-- 5) enforce_placement_limit (Fase 23) contava qualquer linha `active`,
--    sem olhar para o status da matéria — uma matéria agendada para o
--    futuro (ou mesmo um rascunho) já disputava/expulsava vaga hoje, o que
--    é o bug descrito no item 8 da Fase 25. A linha em `article_placements`
--    agora representa "destino declarado pelo editor" (persiste sempre,
--    para sobreviver a um refresh/reabertura do rascunho); só CONTA para o
--    limite 8/3/7/4 e só pode EXPULSAR alguém quando é efetiva de verdade:
--    a matéria está `published` e a janela própria (`starts_at`) já chegou.
--    Rascunho/ajuste/agendada/arquivada nunca disputam. Sem cron: quando
--    "o horário chega" nesta fase é sempre uma ação humana explícita
--    (publicar agora) — não há transição automática scheduled→published —
--    e é essa ação que tocar de novo a linha de `article_placements`
--    (provider reafirma a linha ativa ao publicar) que reavalia a disputa
--    com o status atualizado.
create or replace function public.enforce_placement_limit()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_pinned_count integer;
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

  -- Ainda não efetiva (rascunho, ajuste, arquivada, agendada, ou dentro da
  -- janela mas com starts_at no futuro): a linha é só a declaração de
  -- intenção do editor — não disputa nem expulsa ninguém.
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
    select ap.id, row_number() over (order by ap.created_at desc, ap.id desc) as rn
    from public.article_placements ap
    join public.articles a on a.id = ap.article_id
    where ap.type = NEW.type and ap.active = true and ap.pinned = false and ap.id <> NEW.id
      and (ap.starts_at is null or ap.starts_at <= now())
      and a.status = 'published'
  )
  update public.article_placements
  set active = false
  where id in (select id from ranked where rn > (v_limit - v_pinned_count - 1));

  return NEW;
end;
$$;

comment on function public.enforce_placement_limit() is
  'Fase 25: só disputa/expulsa vaga quando a matéria já está published e a janela própria (starts_at) já chegou. Rascunho/agendada/arquivada nunca disputam — a linha fica só como declaração até uma publicação de verdade tocar o placement de novo.';
