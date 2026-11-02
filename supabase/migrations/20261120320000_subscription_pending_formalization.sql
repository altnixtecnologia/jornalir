-- Bloco E — Assinatura "pendente de formalização" (02/11/2026).
-- Acrescenta o novo status ao CHECK de public.subscriptions.status —
-- NÃO aplicada ainda, mesma regra das demais migrations deste lote
-- (desenvolver agora, aplicar depois de homologação). Puramente
-- aditiva: nenhuma linha existente é tocada (sem UPDATE), nenhum
-- default é alterado no banco — a aplicação (SubscriptionService.register)
-- já passa a enviar 'pending_formalization' explicitamente para toda
-- assinatura nova, mas uma inserção que não informar status continua
-- caindo no default 'active' já existente, sem surpresa de schema.
--
-- "Criar assinatura não pode ativar serviço nem gerar títulos
-- automaticamente": a ativação (-> 'active') e a geração de cobrança
-- passam a exigir ação explícita e separada, cada uma com sua própria
-- permissão (ver activateSubscriptionAction/assinaturas_ativar e o novo
-- bloqueio em generateReceivableFromSubscriptionAction para assinatura
-- ainda pendente). Nenhuma assinatura 'active' existente é alterada —
-- este lote nunca migra retroativamente o status de registros antigos.
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check,
  add constraint subscriptions_status_check
    check (status in ('pending_formalization', 'active', 'suspended', 'cancelled'));

comment on column public.subscriptions.status is
  'pending_formalization (padrão para assinaturas novas, desde o Bloco E) | active | suspended | cancelled. pending_formalization só transiciona para active (ativação explícita, ação separada) ou cancelled — nunca é destino de uma transição de volta.';
