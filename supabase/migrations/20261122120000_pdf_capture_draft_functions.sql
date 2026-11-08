-- Salvamento direto dos rascunhos da captura visual (pedido do usuário,
-- 07/11/2026). Duas funções SECURITY DEFINER, mesmo padrão já usado por
-- convert_import_candidate_to_draft (20261121100000) e endurecido por
-- 20261105100000_editorial_privileged_rpc_guards.sql — dão atomicidade
-- real (artigo + regiões na mesma transação) sem precisar alterar
-- ArticleService/ArticleRepository (que hoje EXIGEM section_id/locality_id
-- — a captura visual nasce sem editoria/localidade escolhida pelo
-- operador, igual à conversão automática de candidatos de PDF).
--
-- O cliente já tem, em visualCaptureAreas.ts, as funções puras que
-- calculam o texto final combinado de cada matéria (combineAreaExtractions/
-- appendRegionToCapture/removeAreaFromCapture) — estas duas funções SQL
-- nunca reimplementam essa lógica, só persistem o estado final que o
-- cliente decidiu. origin='pdf' é sempre travado nas duas, nunca podendo
-- tocar uma matéria normal por engano.

-- save_pdf_capture_draft: cria a matéria (origin='pdf', status='draft',
-- sem editoria/localidade) + as regiões iniciais, tudo numa transação.
-- Idempotente por p_client_capture_id: se já existe uma matéria com esse
-- id (retry de rede após a 1ª chamada já ter tido sucesso), devolve o
-- registro existente em vez de criar uma segunda matéria.
create or replace function public.save_pdf_capture_draft(
  p_edition_id uuid,
  p_page integer,
  p_title text,
  p_subtitle text,
  p_body text,
  p_client_capture_id uuid,
  p_regions jsonb
)
returns table(article_id uuid, article_updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_id uuid;
  v_updated_at timestamptz;
  v_base_slug text;
  v_slug text;
  v_attempt integer := 1;
  v_region jsonb;
  v_idx integer := 0;
begin
  if auth.role() is distinct from 'service_role' and not public.staff_can_module_action('editorial','materias_criar') then
    raise exception 'save_pdf_capture_draft: apenas staff ativo com permissão de criar matérias pode salvar capturas';
  end if;

  if p_client_capture_id is not null then
    select id, updated_at into v_article_id, v_updated_at
    from public.articles
    where pdf_capture_client_id = p_client_capture_id;
    if found then
      return query select v_article_id, v_updated_at;
      return;
    end if;
  end if;

  v_base_slug := public.slugify_pt(coalesce(nullif(trim(p_title), ''), 'materia-capturada'));
  v_slug := v_base_slug;
  while exists (select 1 from public.articles where slug = v_slug) loop
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
  end loop;

  insert into public.articles (
    slug, title, subtitle, body, section_id, locality_id, status,
    notification_mode, origin, newspaper_edition_id, newspaper_page, urgent,
    pdf_capture_client_id
  ) values (
    v_slug,
    coalesce(nullif(trim(p_title), ''), 'Matéria capturada sem título'),
    nullif(p_subtitle, ''),
    coalesce(p_body, ''),
    null,
    null,
    'draft',
    'none',
    'pdf',
    p_edition_id,
    p_page,
    false,
    p_client_capture_id
  )
  returning id, updated_at into v_article_id, v_updated_at;

  for v_region in select * from jsonb_array_elements(coalesce(p_regions, '[]'::jsonb))
  loop
    insert into public.pdf_capture_regions (
      article_id, page, rect_x, rect_y, rect_width, rect_height, sort_order,
      extracted_title, extracted_subtitle, extracted_body, needs_review, warnings
    ) values (
      v_article_id,
      (v_region->>'page')::integer,
      (v_region->'rect'->>'x')::numeric,
      (v_region->'rect'->>'y')::numeric,
      (v_region->'rect'->>'width')::numeric,
      (v_region->'rect'->>'height')::numeric,
      v_idx,
      nullif(v_region->>'extractedTitle', ''),
      nullif(v_region->>'extractedSubtitle', ''),
      nullif(v_region->>'extractedBody', ''),
      coalesce((v_region->>'needsReview')::boolean, false),
      coalesce(v_region->'warnings', '[]'::jsonb)
    );
    v_idx := v_idx + 1;
  end loop;

  return query select v_article_id, v_updated_at;
end;
$$;

comment on function public.save_pdf_capture_draft(uuid, integer, text, text, text, uuid, jsonb) is
  'Cria a matéria (sempre origin=pdf/status=draft, sem editoria/localidade) e as regiões iniciais numa só transação. Idempotente por p_client_capture_id — uma segunda chamada com o mesmo id devolve a matéria já criada, nunca duplica.';

revoke all on function public.save_pdf_capture_draft(uuid, integer, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.save_pdf_capture_draft(uuid, integer, text, text, text, uuid, jsonb) to authenticated, service_role;

-- save_pdf_capture_state: upsert do estado final de uma matéria já criada
-- (anexar trecho / redimensionar-mover / remover uma área / editar texto
-- manualmente — as quatro operações usam esta mesma primitiva, porque o
-- cliente já manda o estado final recombinado). Upsert por
-- (article_id, sort_order); qualquer sort_order que não esteja mais em
-- p_regions é apagado (cobre "remover uma área"). Controle de concorrência
-- otimista: só aplica se articles.updated_at ainda for o valor que o
-- cliente leu por último; se não for, devolve applied=false e NADA é
-- escrito (nem a matéria, nem as regiões) — o cliente recarrega e tenta de
-- novo.
create or replace function public.save_pdf_capture_state(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_subtitle text,
  p_body text,
  p_needs_review boolean,
  p_regions jsonb
)
returns table(applied boolean, article_updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_updated_at timestamptz;
  v_new_updated_at timestamptz;
  v_region jsonb;
  v_idx integer := 0;
  v_kept_sort_orders integer[];
begin
  if auth.role() is distinct from 'service_role' and not public.staff_can_module_action('editorial','materias_editar') then
    raise exception 'save_pdf_capture_state: apenas staff ativo com permissão de editar matérias pode salvar a captura';
  end if;

  select updated_at into v_current_updated_at
  from public.articles
  where id = p_article_id and origin = 'pdf';

  if not found then
    raise exception 'Matéria de captura visual não encontrada: %', p_article_id;
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    return query select false, v_current_updated_at;
    return;
  end if;

  update public.articles
  set title = coalesce(nullif(trim(p_title), ''), 'Matéria capturada sem título'),
      subtitle = nullif(p_subtitle, ''),
      body = coalesce(p_body, '')
  where id = p_article_id and origin = 'pdf'
  returning updated_at into v_new_updated_at;

  select coalesce(array_agg((elem->>'sortOrder')::integer), '{}')
  into v_kept_sort_orders
  from jsonb_array_elements(coalesce(p_regions, '[]'::jsonb)) elem;

  delete from public.pdf_capture_regions
  where article_id = p_article_id
    and sort_order <> all (v_kept_sort_orders);

  for v_region in select * from jsonb_array_elements(coalesce(p_regions, '[]'::jsonb))
  loop
    insert into public.pdf_capture_regions (
      article_id, page, rect_x, rect_y, rect_width, rect_height, sort_order,
      extracted_title, extracted_subtitle, extracted_body, needs_review, warnings
    ) values (
      p_article_id,
      (v_region->>'page')::integer,
      (v_region->'rect'->>'x')::numeric,
      (v_region->'rect'->>'y')::numeric,
      (v_region->'rect'->>'width')::numeric,
      (v_region->'rect'->>'height')::numeric,
      coalesce((v_region->>'sortOrder')::integer, v_idx),
      nullif(v_region->>'extractedTitle', ''),
      nullif(v_region->>'extractedSubtitle', ''),
      nullif(v_region->>'extractedBody', ''),
      coalesce((v_region->>'needsReview')::boolean, false),
      coalesce(v_region->'warnings', '[]'::jsonb)
    )
    on conflict (article_id, sort_order) do update set
      page = excluded.page,
      rect_x = excluded.rect_x,
      rect_y = excluded.rect_y,
      rect_width = excluded.rect_width,
      rect_height = excluded.rect_height,
      extracted_title = excluded.extracted_title,
      extracted_subtitle = excluded.extracted_subtitle,
      extracted_body = excluded.extracted_body,
      needs_review = excluded.needs_review,
      warnings = excluded.warnings;
    v_idx := v_idx + 1;
  end loop;

  return query select true, v_new_updated_at;
end;
$$;

comment on function public.save_pdf_capture_state(uuid, timestamptz, text, text, text, boolean, jsonb) is
  'Upsert idempotente (por article_id+sortOrder) do estado final de uma matéria de captura visual já criada — cobre anexar trecho, redimensionar/mover, remover uma área e edição manual de texto. Concorrência otimista via p_expected_updated_at: se divergir do valor atual, nada é escrito e applied=false é devolvido.';

revoke all on function public.save_pdf_capture_state(uuid, timestamptz, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_pdf_capture_state(uuid, timestamptz, text, text, text, boolean, jsonb) to authenticated, service_role;
