-- Fase 28 — gestão real das edições do jornal. Incremental — não altera
-- nenhuma migration anterior.

-- 1) Quantidade de páginas, quando disponível — campo real do cadastro
--    (item 2 da fase), sem coluna correspondente até aqui.
alter table public.newspaper_editions
  add column page_count integer;

comment on column public.newspaper_editions.page_count is
  'Quantidade de páginas da edição impressa, quando informada no cadastro.';

-- 2) `edition_number` já existe desde a Fase 17 (not null unique) — é o
--    campo próprio pedido no item 3 da fase; nenhuma migration extra
--    necessária para ele, só o provider/tela passam a expô-lo de verdade.

-- 3) Bucket para o PDF oficial de cada edição — gestão interna do backend
--    editorial (não é o mesmo fluxo do Google Drive/Flipbook público de
--    `apps/site`, que continua intocado). Diferente do bucket de mídias
--    (Fase 26, público): aqui a leitura também é só para staff, porque
--    nesta fase o PDF da edição é um artefato de uso editorial interno,
--    não um recurso servido ao portal público. Upload/atualização/troca
--    de arquivo só para staff autenticado; nunca service_role no
--    navegador. Nomes nunca colidem: sempre `{uuid}/{arquivo}.pdf`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'edition-pdfs',
  'edition-pdfs',
  false,
  52428800, -- 50 MB
  array['application/pdf']
)
on conflict (id) do nothing;

create policy edition_pdfs_storage_select_staff
  on storage.objects for select
  to authenticated
  using (bucket_id = 'edition-pdfs' and public.is_active_staff());

create policy edition_pdfs_storage_insert_staff
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'edition-pdfs' and public.is_active_staff());

create policy edition_pdfs_storage_update_staff
  on storage.objects for update
  to authenticated
  using (bucket_id = 'edition-pdfs' and public.is_active_staff())
  with check (bucket_id = 'edition-pdfs' and public.is_active_staff());

create policy edition_pdfs_storage_delete_staff
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'edition-pdfs' and public.is_active_staff());
