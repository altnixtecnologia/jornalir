-- Auditoria (Parte P do Plano Mestre). Tudo relevante deve gerar log;
-- nenhum registro pode ser apagado ou alterado pelo usuário da aplicação —
-- por isso não existe policy de update nem de delete abaixo, nem para
-- admin. Nesta fase só a estrutura é criada; nada a gravar automaticamente
-- ainda (nenhuma tela migrou para o banco).

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Log imutável: criação, edição, publicação, agendamento, arquivamento, mudança de destaque, etc. Sem UPDATE/DELETE para nenhum papel — nem admin.';

create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);
create index audit_events_created_at_idx
  on public.audit_events (created_at desc);

alter table public.audit_events enable row level security;

-- Só admin lê o histórico (Plano Mestre: "rastreável pelo administrador").
create policy audit_events_select_admin
  on public.audit_events for select
  to authenticated
  using (public.is_active_admin());

-- Qualquer staff ativo pode registrar um evento, mas só em seu próprio
-- nome — nunca gravando uma ação como se fosse de outra pessoa.
create policy audit_events_insert_staff_own
  on public.audit_events for insert
  to authenticated
  with check (public.is_active_staff() and user_id = auth.uid());
