-- Fase 35B (revisão do ChatGPT, bloqueio 3) — garante no BANCO que a mesma
-- imagem externa nunca vira duas linhas em media_assets, mesmo sob
-- concorrência (o SELECT-antes-de-INSERT do importador sozinho não
-- protege contra duas execuções simultâneas). Aplicada agora porque ainda
-- não existe nenhuma carga real do legado — é a hora segura para
-- endurecer isso (nenhuma linha existente pode violar o índice).
create unique index media_assets_origin_source_url_key
  on public.media_assets (origin_source_url)
  where origin_source_url is not null;

comment on index public.media_assets_origin_source_url_key is
  'Uma imagem externa do legado (origin_source_url) nunca pode virar duas linhas em media_assets, mesmo sob execuções concorrentes do importador (Fase 35B).';
