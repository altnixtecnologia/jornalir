-- Fase 45B — carga real do lote 2023-2024: 1 imagem do legado é BMP
-- (`https://suitacdn.cloud-bricks.net/fotos/890776/file/desktop/brs.bmp?1704314984`)
-- e foi rejeitada pelo bucket `article-media`, que hoje aceita
-- jpeg/png/webp/avif/gif (ver 20261005100000_article_media_allow_gif.sql,
-- mesmo padrão de achado, agora com BMP). Atualiza SOMENTE a lista de
-- MIME permitidos, mantendo os já existentes; não recria o bucket, não
-- apaga objetos, não altera nenhuma policy.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp']
where id = 'article-media';
