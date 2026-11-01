-- Bloco 2 (Assinaturas e Financeiro), item 5: idempotência real contra
-- conversões simultâneas da MESMA solicitação. NÃO aplicada ainda
-- (preparada localmente).
--
-- ACHADO: a idempotência da conversão (convertSubscriptionInterestAction/
-- convertAdvertisingInterestAction, Bloco 1) dependia só de buscar um
-- registro já existente (assinatura/proposta) por um texto-marcador nas
-- notas ANTES de criar um novo — sem nenhuma trava, duas chamadas
-- concorrentes (duplo clique, ou duas pessoas convertendo a mesma
-- solicitação ao mesmo tempo) podiam passar pela mesma checagem "ainda
-- não existe" e cada uma criar sua própria assinatura/proposta
-- duplicada, só a última gravando o vínculo final na solicitação (a
-- primeira ficaria "perdida", sem nenhum erro visível).
--
-- `conversion_started_at` funciona como uma trava otimista: a Server
-- Action faz um UPDATE condicional (WHERE conversion_started_at is null
-- AND status not in ('converted','discarded')) ANTES de criar qualquer
-- coisa — só uma das chamadas concorrentes consegue gravar essa
-- primeira escrita (a segunda recebe 0 linhas afetadas e devolve erro
-- "conversão já em andamento", sem criar nada). Nunca apagada depois de
-- "converted" (fica como registro de quando a conversão real começou);
-- liberada de volta pra null se a conversão falhar no meio do caminho
-- (falha parcial), ou automaticamente tratada como abandonada pela
-- aplicação depois de um tempo (crash do processo a meio da conversão),
-- sem precisar de outra migration.
alter table public.site_interest_requests
  add column if not exists conversion_started_at timestamptz;

comment on column public.site_interest_requests.conversion_started_at is
  'Trava otimista contra conversão simultânea da mesma solicitação — setada atomicamente (UPDATE condicional) antes de criar cliente/assinatura/proposta, liberada (null) se a conversão falhar no meio do caminho. Não é um status: a solicitação continua em status de atendimento normal enquanto uma conversão está em andamento.';
