-- Destaque com foto + edição manual de mensagens — pedido explícito do
-- usuário em 17/10/2026 para o módulo Aniversariantes. Incremental sobre
-- 20261025100100_birthday_entries.sql e 20261025100200_birthday_edition_
-- messages.sql. NÃO aplicada ainda (local apenas).
--
-- REVERSÃO EXPLÍCITA de decisão anterior: o comentário original de
-- birthday_edition_messages dizia "Sem Destaque, sem edição manual de
-- texto... decisão final do módulo removeu essas funcionalidades". O
-- usuário autorizou expressamente, em 17/10/2026, reintroduzir as duas
-- funcionalidades. Este arquivo implementa essa reversão — não é uma
-- contradição não resolvida, é a nova decisão.

-- ==================================================================
-- 1) FOTO DE DESTAQUE — reaproveita o pipeline real de media_assets/R2
-- já usado em todo o projeto (mesmo princípio de site_ad_media). Nenhum
-- storage novo criado. Nullable: a maioria dos aniversariantes nunca
-- precisa de foto; quando ausente, a tela não mostra nenhum destaque.
-- ==================================================================
alter table public.birthday_entries
  add column if not exists photo_media_asset_id uuid references public.media_assets (id) on delete set null;

comment on column public.birthday_entries.photo_media_asset_id is
  'Foto de destaque opcional do aniversariante/instituição, para publicação — reaproveita media_assets/R2 (nenhum storage novo). Null = sem destaque visual, comportamento atual preservado.';

create index if not exists birthday_entries_photo_media_asset_id_idx
  on public.birthday_entries (photo_media_asset_id) where photo_media_asset_id is not null;

-- ==================================================================
-- 2) EDIÇÃO MANUAL DA MENSAGEM — a mensagem continua pertencendo à
-- EDIÇÃO (nunca ao aniversariante, ver comentário original da tabela).
-- message_override guarda o texto digitado manualmente; manually_edited
-- marca que "message" veio de edição manual, não do gerador. "Trocar
-- mensagem" (regenerar) sempre LIMPA manually_edited/message_override —
-- editar manualmente e regenerar automaticamente são operações
-- alternativas, nunca combinadas na mesma linha.
-- ==================================================================
alter table public.birthday_edition_messages
  add column if not exists message_override text,
  add column if not exists manually_edited boolean not null default false;

comment on column public.birthday_edition_messages.message_override is
  'Texto digitado manualmente pelo usuário, quando manually_edited = true. Quando manually_edited = false este campo fica null e "message" vem do gerador automático.';
comment on column public.birthday_edition_messages.manually_edited is
  'true = o campo message foi sobrescrito manualmente (ver message_override) e NÃO deve ser considerado pelo gerador como uma família/abertura/encerramento de template ao evitar repetição. false = message veio do gerador automático (comportamento original).';
