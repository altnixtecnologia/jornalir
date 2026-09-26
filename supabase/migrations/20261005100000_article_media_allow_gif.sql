-- Fase 35E — revisão do ChatGPT após a execução real do lote 2015-2016:
-- 80 imagens do legado são GIF e foram rejeitadas pelo bucket
-- `article-media`, que hoje só aceita jpeg/png/webp/avif. O importador já
-- reconhece image/gif e já gera a extensão certa — o bloqueio é só a
-- configuração do bucket. Atualiza SOMENTE a lista de MIME permitidos,
-- mantendo os já existentes; não recria o bucket, não apaga objetos, não
-- altera nenhuma policy.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
where id = 'article-media';
