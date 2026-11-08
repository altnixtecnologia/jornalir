-- Salvamento direto dos rascunhos da captura visual (pedido do usuário,
-- 07/11/2026) — backfill único e idempotente. Preenche pdf_capture_regions
-- para matérias de origin='pdf' que já existem (ex.: as 28 da edição 776,
-- recuperadas manualmente pelo ChatGPT direto em produção) a partir das
-- coordenadas já guardadas em audit_events.metadata->'areas'
-- (action='visual_pdf_capture_recovered_as_draft'). SÓ LEITURA sobre
-- audit_events/articles — nenhuma das duas é alterada; esta migration
-- apenas INSERE em pdf_capture_regions (tabela nova, vazia antes disto).
--
-- Genérico (não hardcoded para a edição 776/943f2eee...) — serve para
-- qualquer edição com o mesmo padrão de recuperação. Idempotente: só
-- insere para article_id que ainda não tem nenhuma linha em
-- pdf_capture_regions (NOT EXISTS), então rodar de novo nunca duplica.
--
-- Aceita tanto `area.rect.{x,y,width,height}` (formato aninhado, igual ao
-- Area do cliente — o esperado, já que a recuperação leu o mesmo JSON de
-- exportPreview()) quanto `area.{x,y,width,height}` (formato plano), sem
-- saber de antemão qual o ChatGPT usou — nenhuma das duas tentativas pode
-- falhar a migration, só deixa de inserir a linha se nenhuma bater.
--
-- Texto extraído por região fica vazio para estas linhas de backfill — o
-- corpo final já está correto em articles.body; se o operador um dia
-- mover/redimensionar uma destas áreas, o recálculo real
-- (extractRegionAt) preenche o texto daquela região, igual a qualquer
-- área nova.

insert into public.pdf_capture_regions (
  article_id, page, rect_x, rect_y, rect_width, rect_height, sort_order
)
select
  a.id,
  coalesce(
    (area->>'page')::integer,
    (ae.metadata->>'pdf_page')::integer,
    1
  ),
  greatest(0, least(1, coalesce(area->'rect'->>'x', area->>'x')::numeric)),
  greatest(0, least(1, coalesce(area->'rect'->>'y', area->>'y')::numeric)),
  greatest(0.00001, least(1, coalesce(area->'rect'->>'width', area->>'width')::numeric)),
  greatest(0.00001, least(1, coalesce(area->'rect'->>'height', area->>'height')::numeric)),
  (row_number() over (partition by a.id order by ordinality) - 1)::integer
from public.audit_events ae
join public.articles a
  on a.id = ae.entity_id
cross join lateral jsonb_array_elements(coalesce(ae.metadata->'areas', '[]'::jsonb)) with ordinality as t(area, ordinality)
where ae.entity_type = 'articles'
  and ae.action = 'visual_pdf_capture_recovered_as_draft'
  and a.origin = 'pdf'
  and coalesce(area->'rect'->>'x', area->>'x') is not null
  and coalesce(area->'rect'->>'y', area->>'y') is not null
  and coalesce(area->'rect'->>'width', area->>'width') is not null
  and coalesce(area->'rect'->>'height', area->>'height') is not null
  and not exists (
    select 1 from public.pdf_capture_regions r where r.article_id = a.id
  )
on conflict (article_id, sort_order) do nothing;
