-- Módulo WhatsApp — controle interno de atendimento (03/11/2026, revisado).
--
-- Decisão revisada do usuário: aproveitar o número de atendimento que já
-- existe e já funciona no WhatsApp normal (app/web.whatsapp.com), SEM
-- migrá-lo para a Cloud API. Este módulo NÃO envia, recebe nem sincroniza
-- mensagens reais do WhatsApp — é só um controle interno e simples de quem
-- está responsável por cada atendimento, em que situação e com que
-- observações, para a equipe se organizar ao usar o WhatsApp normalmente.
-- Nunca presume que mensagens/respostas do WhatsApp estão sincronizadas.

create table if not exists public.whatsapp_attendance_cases (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_phone text,
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  assigned_to uuid references public.profiles(id),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.whatsapp_attendance_cases is
  'Controle INTERNO de atendimento (responsável/situação/observações) para o número de WhatsApp já existente — nunca sincroniza mensagens reais, nunca substitui o próprio WhatsApp.';

alter table public.whatsapp_attendance_cases enable row level security;
revoke all on public.whatsapp_attendance_cases from anon, authenticated;
-- Privilégio de tabela necessário ANTES das policies de RLS abaixo
-- fazerem efeito (RLS restringe LINHAS, não substitui o GRANT de ação).
grant select, insert, update on public.whatsapp_attendance_cases to authenticated;

-- Leitura: qualquer staff ativo com visibilidade do módulo 'whatsapp'
-- (owner/admin sempre, operador só com staff_module_visibility concedida).
drop policy if exists whatsapp_attendance_cases_select on public.whatsapp_attendance_cases;
create policy whatsapp_attendance_cases_select on public.whatsapp_attendance_cases
  for select to authenticated
  using (public.is_active_staff() and public.staff_can_see_module('whatsapp'));

-- Escrita (criar, atualizar status/responsável/observações): exige a ação
-- 'atendimento_gerenciar' — nunca presumida só pela visibilidade do módulo.
drop policy if exists whatsapp_attendance_cases_insert on public.whatsapp_attendance_cases;
create policy whatsapp_attendance_cases_insert on public.whatsapp_attendance_cases
  for insert to authenticated
  with check (public.is_active_staff() and public.staff_can_module_action('whatsapp','atendimento_gerenciar'));

drop policy if exists whatsapp_attendance_cases_update on public.whatsapp_attendance_cases;
create policy whatsapp_attendance_cases_update on public.whatsapp_attendance_cases
  for update to authenticated
  using (public.is_active_staff() and public.staff_can_module_action('whatsapp','atendimento_gerenciar'))
  with check (public.is_active_staff() and public.staff_can_module_action('whatsapp','atendimento_gerenciar'));

-- Integra ao sistema de permissões já existente — nunca um segundo cadastro
-- de funcionários. staff_can_see_module/staff_can_module_action já são
-- genéricas (leem module_key dinamicamente); só os CHECKs de valores
-- aceitos precisam incluir 'whatsapp'.
alter table public.staff_module_visibility
  drop constraint if exists staff_module_visibility_module_key_check,
  add constraint staff_module_visibility_module_key_check
    check (module_key in ('editorial','clientes','financeiro','assinaturas','publicidade','nfse','aniversariantes','whatsapp'));

alter table public.staff_module_action_permissions
  drop constraint if exists staff_module_actions_known_pair,
  add constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar', 'locacao_equipamentos_gerenciar', 'locacao_reservas_gerenciar', 'locacao_vistorias_registrar', 'contratos_preparar', 'contratos_revisar'))
    or (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'configuracoes_gerenciar', 'perfis_servico_gerenciar'))
    or (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
    or (module_key = 'whatsapp' and action_key in ('atendimento_gerenciar'))
  );
