-- Fase 26 — banco/Storage prontos para o provider real de Mídias.
-- Incremental — não altera nenhuma migration anterior.

-- 1) `altText`/`capturedAt` são campos editáveis de verdade na tela de
--    Mídias (cadastro e edição) desde a Fase 16/22 — sem coluna, a Fase 25
--    já corria o risco de descartá-los silenciosamente assim que o
--    provider real de mídia existisse. Corrigido agora, junto com o
--    provider (não antes, para não mudar schema sem uso imediato).
alter table public.media_assets
  add column alt_text text,
  add column captured_at date;

comment on column public.media_assets.alt_text is
  'Texto alternativo (acessibilidade) — MediaAsset.altText.';
comment on column public.media_assets.captured_at is
  'Data em que a foto foi feita — distinta de created_at (data de cadastro no sistema). Só data, sem hora (input type=date no formulário).';

-- 2) Bucket do Supabase Storage para as imagens editoriais. Público para
--    leitura (a foto precisa ser exibida no futuro portal público sem
--    exigir sessão), mas upload/alteração só para staff autenticado —
--    nunca service_role no navegador. Nomes de arquivo nunca colidem: o
--    provider sempre grava em `{uuid}/{arquivo-original-sanitizado}`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-media',
  'article-media',
  true,
  8388608, -- 8 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

create policy article_media_storage_select_public
  on storage.objects for select
  using (bucket_id = 'article-media');

create policy article_media_storage_insert_staff
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'article-media' and public.is_active_staff());

create policy article_media_storage_update_staff
  on storage.objects for update
  to authenticated
  using (bucket_id = 'article-media' and public.is_active_staff())
  with check (bucket_id = 'article-media' and public.is_active_staff());

create policy article_media_storage_delete_staff
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'article-media' and public.is_active_staff());
