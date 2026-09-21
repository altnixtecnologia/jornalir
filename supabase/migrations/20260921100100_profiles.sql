-- Perfis complementares a auth.users (Parte B do Plano Mestre): papel,
-- nome de exibição e status ativo/inativo. Dois papéis nesta fase — admin
-- (acesso completo ao conteúdo editorial) e editorial (matérias, editorias,
-- localidades, mídias, importação de PDF, publicação editorial). Sem
-- permissões de financeiro/CRM ainda, porque esses módulos não existem.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'editorial' check (role in ('admin', 'editorial')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil complementar de cada usuário do painel (papel, nome, status). Uma linha por auth.users.id.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Funções auxiliares de RLS — SECURITY DEFINER para não recair em RLS
-- recursivo ao consultar a própria tabela profiles a partir de uma policy
-- de profiles. Usadas por todas as políticas das migrations seguintes.
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('admin', 'editorial')
  );
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'admin'
  );
$$;

comment on function public.is_active_staff() is
  'True quando o usuário autenticado tem um profile ativo (admin ou editorial). Base de quase toda policy de conteúdo editorial.';
comment on function public.is_active_admin() is
  'True quando o usuário autenticado tem um profile ativo com role admin.';

-- Cria automaticamente o profile ao nascer um novo auth.users — nunca
-- depende de a aplicação lembrar de inserir a linha complementar. Role
-- inicial sempre "editorial" (o mais restrito); promover a admin é uma
-- ação deliberada feita depois, nunca o padrão de um cadastro novo.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'editorial',
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;

-- Qualquer usuário autenticado vê o próprio perfil (necessário para a UI
-- saber seu papel); admin ativo vê todos.
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_active_admin());

-- Só admin ativo cria/edita perfis de outras pessoas (promover a admin,
-- ativar/inativar). Ninguém edita o próprio papel/status sozinho.
create policy profiles_insert_admin_only
  on public.profiles for insert
  to authenticated
  with check (public.is_active_admin());

create policy profiles_update_admin_only
  on public.profiles for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- Sem policy de delete: perfil nunca é apagado pela aplicação (inativar é
-- a operação reversível oferecida — mesmo princípio de editorias/
-- localidades desde a Fase 12).
