-- JoIR como assistente operacional baseado em regras, SEM API paga de IA
-- (18/10/2026) — primeira fase: só o esqueleto do mecanismo de regras e
-- permissões por tipo de ação, pedido explícito do usuário. Nenhuma
-- automação roda de verdade ainda; todas nascem desligadas.
--
-- PENDENTE DE APLICAÇÃO: preparada e versionada, não executada no Supabase
-- remoto nesta etapa.
--
-- Por que uma tabela nova (e não reaproveitar ai_approval_requests): essa
-- tabela já existente (20261018030210_ai_assistant_base.sql) é a FILA de
-- propostas pontuais já geradas (uma linha por sugestão da IA paga, hoje
-- pausada). joir_automation_rules é o CATÁLOGO de regras/gatilhos
-- possíveis — nasce aqui pensando em regras determinísticas (sem chamar
-- nenhuma API de IA), mas o conceito de "proposta pendente de aprovação"
-- continua sendo a mesma fila ai_approval_requests quando uma regra da
-- categoria approve_required de fato disparar (não duplica o mecanismo de
-- aprovação, só adiciona o catálogo de regras que podem alimentá-lo).
--
-- category distingue o nível de autonomia, pedido explícito do usuário:
--   observe              -> só registra em audit_events, nunca propõe nada.
--   prepare              -> monta um rascunho/contexto, não notifica ninguém ainda.
--   approve_required     -> vira uma linha em ai_approval_requests; só executa
--                           se um owner/admin aprovar explicitamente.
--   auto_execute_allowed -> pode executar sozinha SE enabled=true — reservado
--                           para ações de baixíssimo risco (ex.: só observação
--                           automatizada); nunca usada nesta fase para publicar
--                           matéria, mudar valor financeiro, enviar mensagem
--                           externa, cobrar ou alterar registro sensível (essas
--                           ações ficam proibidas por constraint abaixo).
create table if not exists public.joir_automation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  label text not null,
  module text not null,
  category text not null check (category in ('observe', 'prepare', 'approve_required', 'auto_execute_allowed')),
  description text not null default '',
  -- Nasce sempre desligada — ligar é uma decisão separada, posterior a
  -- simulação/teste, nunca automática por esta migration.
  enabled boolean not null default false,
  -- Trava adicional e redundante (defesa em profundidade): nesta fase,
  -- NENHUMA regra auto_execute_allowed pode estar habilitada, de nenhum
  -- módulo — cobre explicitamente "nunca publicar matéria, alterar valor
  -- financeiro, enviar mensagem externa, cobrar ou alterar registro
  -- sensível sem autorização específica". Liberar essa categoria para um
  -- caso realmente seguro é decisão de uma migration futura dedicada,
  -- revisada caso a caso — não um módulo numa lista de exceção aqui.
  constraint joir_automation_rules_no_auto_exec_yet check (
    not (enabled and category = 'auto_execute_allowed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

comment on table public.joir_automation_rules is
  'Catálogo de regras determinísticas que o JoIR pode observar/preparar/propor/executar (sem API paga de IA). Toda regra nasce com enabled=false. Nesta fase, category=auto_execute_allowed nunca pode ficar habilitada, de nenhum módulo (constraint) — liberar isso é decisão de uma migration futura dedicada. Execuções e decisões de cada regra são registradas em public.audit_events (entity_type=''joir_automation_rule''), não numa tabela de log separada.';

create index if not exists joir_automation_rules_module_idx on public.joir_automation_rules (module);

create trigger joir_automation_rules_set_updated_at
  before update on public.joir_automation_rules
  for each row execute function public.set_updated_at();

alter table public.joir_automation_rules enable row level security;

-- Mesmo padrão de acesso do restante do JoIR (configurações, propostas):
-- só o proprietário ativo enxerga/administra o catálogo de regras.
create policy joir_automation_rules_owner_select
  on public.joir_automation_rules for select
  to authenticated
  using (public.is_active_owner());

create policy joir_automation_rules_owner_update
  on public.joir_automation_rules for update
  to authenticated
  using (public.is_active_owner())
  with check (public.is_active_owner());

-- Inserção/remoção de regras do catálogo só por service_role (controle de
-- versão do catálogo é um deploy/migration, não uma ação de tela nesta
-- fase) — evita que o próprio proprietário crie uma regra nova fora do
-- código revisado.
revoke insert, delete on public.joir_automation_rules from authenticated, anon;

-- Catálogo inicial (mapeamento pedido pelo usuário) — todas desligadas,
-- category escolhida pelo risco real de cada uma, nenhuma delas
-- auto_execute_allowed nesta fase.
insert into public.joir_automation_rules (rule_key, label, module, category, description) values
  (
    'subscriptions_due_soon',
    'Assinaturas próximas do vencimento',
    'assinaturas',
    'observe',
    'Observa assinaturas com vencimento nos próximos dias e registra em audit_events — não envia nada, não decide nada. Complementa (não substitui) o módulo de Avisos de vencimento já existente.'
  ),
  (
    'overdue_tasks',
    'Tarefas/pauta atrasadas',
    'agenda',
    'observe',
    'Observa itens de agenda/pauta com prazo vencido e sem conclusão, registrando em audit_events para revisão administrativa.'
  ),
  (
    'articles_with_pending_issues',
    'Matérias com pendências editoriais',
    'editorial',
    'prepare',
    'Identifica matérias agendadas/publicadas com inconsistências prováveis (ex.: sem capa, sem editoria confirmada) e prepara um resumo para conferência — nunca publica, edita ou arquiva nada por conta própria.'
  ),
  (
    'notification_dispatch_review',
    'Revisão de notificações editoriais ignoradas',
    'editorial',
    'approve_required',
    'Quando o gatilho de notificação automática ignora uma publicação (flag desligada), prepara uma proposta de revisão em ai_approval_requests para um owner/admin decidir se vale enviar manualmente — nunca envia nada por conta própria.'
  )
on conflict (rule_key) do nothing;
