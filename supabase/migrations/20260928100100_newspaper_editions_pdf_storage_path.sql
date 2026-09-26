-- Fase 28 (correção de design, mesma fase) — `pdf_url` sozinho não é
-- suficiente para o upload real: o bucket `edition-pdfs` é privado (só
-- staff), então uma URL assinada expira e não pode ser guardada como se
-- fosse permanente. Guarda-se o caminho no Storage (`pdf_storage_path`),
-- e o provider gera uma URL assinada nova a cada leitura — nunca expira
-- silenciosamente. `pdf_url` continua existindo para o caso (raro, mas
-- válido) de colar uma URL já hospedada externamente em vez de fazer
-- upload — mesmo padrão de `media_assets.public_url`. Incremental — não
-- altera a migration de minutos atrás desta mesma fase.
alter table public.newspaper_editions
  add column pdf_storage_path text;

comment on column public.newspaper_editions.pdf_storage_path is
  'Caminho no bucket privado edition-pdfs (Storage) quando o PDF foi enviado por upload — o provider gera uma URL assinada nova a cada leitura. Nulo quando pdf_url aponta para uma URL externa já hospedada.';
