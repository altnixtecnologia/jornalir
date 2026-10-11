-- NFS-e — modelo de ORIGEM do rascunho, pensado para o futuro Altnix
-- Informativo (Fase 5 da rodada "Comercial completo"). NÃO aplicada
-- ainda (local apenas). Incremental sobre 20261021100000_nfse_base.sql
-- e 20261028100000_comercial_publicidade.sql.
--
-- DESENHO: origin_system/origin_type/origin_record_id é o modelo
-- GENÉRICO e PERMANENTE — origin_record_id é texto livre (nunca uma FK
-- cross-project obrigatória), porque o núcleo de NFS-e do Jornal IR
-- deverá futuramente aceitar rascunhos vindos de outros sistemas (ex.:
-- Altnix Informativo, via API autenticada — não implementada agora,
-- só o modelo). commercial_sale_id é só uma CONVENIÊNCIA LOCAL opcional
-- (join rápido pra tela de detalhe da venda) — nunca o modelo real
-- depende dela; uma origem futura de outro sistema nunca terá esse
-- campo preenchido, e isso é esperado/normal.
--
-- Exemplo Jornal IR (preenchido pela própria aplicação ao clicar "Criar
-- rascunho de NFS-e" na venda comercial):
--   origin_system = 'jornal_ir'
--   origin_type = 'commercial_sale'
--   origin_record_id = <commercial_sales.id>::text
--   commercial_sale_id = <commercial_sales.id>  (mesmo valor, só pra join local)

alter table public.nfse_drafts
  add column origin_system text,
  add column origin_type text,
  add column origin_record_id text,
  add column commercial_sale_id uuid references public.commercial_sales (id);

comment on column public.nfse_drafts.origin_system is
  'Sistema de origem do rascunho (ex.: ''jornal_ir'', futuramente ''altnix_informativo''). Nulo = origem manual direta na tela de NFS-e, sem vínculo com outro registro.';
comment on column public.nfse_drafts.origin_type is
  'Tipo do registro de origem dentro do sistema de origem (ex.: ''commercial_sale''). Sempre junto de origin_system, nunca um sem o outro.';
comment on column public.nfse_drafts.origin_record_id is
  'Id do registro de origem, como TEXTO LIVRE — nunca uma FK cross-project obrigatória, de propósito: origens futuras (ex.: Altnix Informativo) são de outro banco/projeto. Para origem local (Jornal IR), é o uuid de commercial_sales.id convertido para texto.';
comment on column public.nfse_drafts.commercial_sale_id is
  'Conveniência LOCAL opcional para join rápido com a venda comercial de origem (quando origin_system=''jornal_ir'' e origin_type=''commercial_sale'') — nunca a fonte de verdade da origem; o modelo genérico (origin_system/origin_type/origin_record_id) é quem representa a origem de fato, inclusive para origens futuras sem este campo preenchido.';

-- Nunca dois rascunhos para a MESMA origem sem confirmação explícita do
-- usuário (item explícito da tarefa) — proteção real por constraint,
-- nunca só a UI. Índice parcial: só se aplica quando os três campos de
-- origem estão preenchidos (rascunho manual, sem origem, nunca é
-- restringido por isto).
create unique index nfse_drafts_origin_unique
  on public.nfse_drafts (origin_system, origin_type, origin_record_id)
  where origin_system is not null and origin_type is not null and origin_record_id is not null;

create index nfse_drafts_commercial_sale_id_idx on public.nfse_drafts (commercial_sale_id) where commercial_sale_id is not null;
