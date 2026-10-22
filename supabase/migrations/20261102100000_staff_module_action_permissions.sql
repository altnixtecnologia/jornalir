-- Acoes adicionais por modulo para operadores. A visibilidade/leitura
-- continua na tabela staff_module_visibility; Financeiro usa sua matriz
-- staff_finance_action_permissions. Agenda/Pauta mantém sua política própria.
-- Migration preparatoria: NÃO aplicar em producao sem auditoria das RLS
-- das tabelas de dados e dos endpoints que aceitam escrita direta.
create table if not exists public.staff_module_action_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null,
  action_key text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id,module_key,action_key),
  constraint staff_module_actions_known_pair check (
    (module_key = 'editorial' and action_key in ('materias_criar', 'materias_editar', 'materias_publicar', 'materias_arquivar', 'midias_gerenciar', 'edicoes_gerenciar'))
    or     (module_key = 'clientes' and action_key in ('clientes_criar', 'clientes_editar'))
    or     (module_key = 'assinaturas' and action_key in ('assinaturas_criar', 'assinaturas_editar', 'assinaturas_suspender', 'assinaturas_cancelar'))
    or     (module_key = 'publicidade' and action_key in ('produtos_gerenciar', 'propostas_criar', 'propostas_editar', 'propostas_aprovar', 'vendas_criar', 'vendas_editar', 'vendas_cancelar'))
    or     (module_key = 'nfse' and action_key in ('rascunhos_criar', 'rascunhos_editar', 'notas_emitir', 'notas_cancelar', 'configuracoes_gerenciar'))
    or     (module_key = 'aniversariantes' and action_key in ('aniversariantes_gerenciar', 'mensagens_gerenciar'))
  )
);

alter table public.staff_module_action_permissions enable row level security;
revoke all on public.staff_module_action_permissions from anon,authenticated;
grant select,insert,update on public.staff_module_action_permissions to authenticated;

create policy staff_module_actions_read on public.staff_module_action_permissions
for select to authenticated
using (profile_id=(select auth.uid()) or (select public.is_active_admin_or_owner()));

create policy staff_module_actions_add on public.staff_module_action_permissions
for insert to authenticated
with check ((select public.is_active_admin_or_owner()) and exists (
 select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));

create policy staff_module_actions_edit on public.staff_module_action_permissions
for update to authenticated
using ((select public.is_active_admin_or_owner()) and exists (
 select 1 from public.profiles p where p.id=profile_id and p.role='operator'
))
with check ((select public.is_active_admin_or_owner()) and exists (
 select 1 from public.profiles p where p.id=profile_id and p.role='operator'
));

-- Negar por padrão. O proprietário e admins continuam com autorização plena,
-- enquanto um operador precisa de visibilidade + concessão explícita da ação.
create or replace function public.staff_can_module_action(p_module text,p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
   select 1 from public.profiles p
   where p.id=(select auth.uid()) and p.active
   and (
     p.role in ('owner','admin')
     or (p.role='operator' and public.staff_can_see_module(p_module)
       and exists (
         select 1 from public.staff_module_action_permissions perms
         where perms.profile_id=p.id
           and perms.module_key=p_module
           and perms.action_key=p_action
           and perms.allowed
       )
     )
   )
 );
$$;
revoke all on function public.staff_can_module_action(text,text) from public,anon;
grant execute on function public.staff_can_module_action(text,text) to authenticated;
