-- Fase 19 — substitui o modelo de papéis (admin/editorial) por
-- owner/admin/operator. Migration incremental — nunca edita as migrations
-- já aplicadas na Fase 18; só ALTER/CREATE OR REPLACE a partir do estado
-- real do banco em produção.
--
-- owner: no máximo 1, dono do sistema, nunca editável/desativável/
--   apagável/rebaixável por ninguém (nem por si mesmo pelo painel) — regra
--   reforçada tanto por RLS quanto por trigger (defesa em profundidade,
--   independente de qualquer bug de policy).
-- admin: acesso administrativo amplo; cria/gerencia operator; nunca pode
--   promover a admin nem tocar no owner.
-- operator: acesso ao fluxo editorial (substitui o antigo "editorial");
--   sem gestão de usuários.

-- 1) Migra os dados existentes ANTES de trocar a constraint (a constraint
-- antiga ainda não aceita 'operator' — precisa sair do caminho primeiro).
alter table public.profiles drop constraint profiles_role_check;

update public.profiles set role = 'operator' where role = 'editorial';
-- 'admin' já é um valor válido no novo enum — nada a migrar para ele.

alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'admin', 'operator'));

alter table public.profiles alter column role set default 'operator';

-- 2) No máximo 1 owner — garantido no próprio banco, não só pela aplicação.
-- Índice único sobre uma coluna cujo valor é sempre 'owner' nas linhas
-- filtradas: só pode existir uma linha com esse valor.
create unique index profiles_single_owner
  on public.profiles (role)
  where role = 'owner';

comment on index public.profiles_single_owner is
  'Garante no máximo 1 profile com role = owner em todo o banco.';

-- 3) Proteção do owner contra edição/desativação/exclusão — por QUALQUER
-- caminho (RLS cobre "quem pode tentar"; este trigger cobre "o que pode
-- acontecer com a linha do owner", mesmo que uma policy tenha um bug ou
-- que a escrita venha de um contexto que já passou pela RLS).
create or replace function public.protect_owner_profile()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.role = 'owner' then
      raise exception 'O perfil do owner não pode ser removido.';
    end if;
    return OLD;
  end if;

  -- UPDATE: só restringe quando a linha JÁ ERA owner (não bloqueia a
  -- promoção inicial de alguém a owner — essa continua protegida só pelo
  -- índice único acima, que impede um segundo owner simultâneo).
  if OLD.role = 'owner' then
    if NEW.id is distinct from OLD.id then
      raise exception 'O id do owner não pode ser alterado.';
    end if;
    if NEW.role is distinct from 'owner' then
      raise exception 'O role do owner não pode ser alterado.';
    end if;
    if NEW.active is distinct from true then
      raise exception 'O owner não pode ser desativado.';
    end if;
  end if;

  return NEW;
end;
$$;

comment on function public.protect_owner_profile() is
  'Bloqueia qualquer UPDATE/DELETE que altere role/active/id de uma linha que já era owner. Não impede a criação do primeiro owner (isso é papel do índice único).';

create trigger profiles_protect_owner
  before update or delete on public.profiles
  for each row
  execute function public.protect_owner_profile();

-- 4) Trigger de novo usuário: role inicial agora é sempre "operator" —
-- nunca admin, nunca owner. CREATE OR REPLACE só troca o corpo da função;
-- o trigger em auth.users (Fase 17) continua o mesmo, sem precisar recriar.
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
    'operator',
    true
  );
  return new;
end;
$$;

-- 5) Helpers de RLS — redefinidos aqui (CREATE OR REPLACE, mesmo nome e
-- assinatura da Fase 17). Toda policy de conteúdo (articles, editorial_
-- sections, localities, newspaper_editions, media_assets, article_
-- placements, article_media, pdf_import_*) chama is_active_staff() pelo
-- NOME, então redefinir o corpo aqui já propaga o novo conjunto de papéis
-- para todas elas sem precisar tocar em nenhuma dessas policies.
create or replace function public.is_active_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('owner', 'admin', 'operator')
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
  'True quando o usuário autenticado tem um profile ativo com owner, admin ou operator — acesso amplo ao conteúdo editorial.';
comment on function public.is_active_admin() is
  'True quando o usuário autenticado tem um profile ativo com role = admin (exatamente admin, não owner).';

-- Novos helpers, específicos do modelo de 3 papéis.
create or replace function public.is_active_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'owner'
  );
$$;

create or replace function public.is_active_admin_or_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('owner', 'admin')
  );
$$;

comment on function public.is_active_owner() is
  'True quando o usuário autenticado é o owner ativo.';
comment on function public.is_active_admin_or_owner() is
  'True quando o usuário autenticado é owner ou admin ativo — usado para gestão de usuários e leitura de auditoria.';

-- 6) profiles — políticas reescritas para o modelo de 3 papéis.
drop policy profiles_select_own_or_admin on public.profiles;
drop policy profiles_insert_admin_only on public.profiles;
drop policy profiles_update_admin_only on public.profiles;

-- Select: o próprio perfil, ou qualquer perfil quando owner/admin (tela
-- /sistema/usuarios). Operator nunca vê perfil alheio.
create policy profiles_select_own_or_admin_owner
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_active_admin_or_owner());

-- Insert manual (fora do trigger de signup) só por owner/admin — caminho
-- raro, o normal é o trigger em auth.users.
create policy profiles_insert_admin_owner
  on public.profiles for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

-- Update: owner pode alterar qualquer perfil não-owner, promovendo/
-- rebaixando entre admin e operator; admin só pode alterar perfis que já
-- são operator, e nunca promove (o novo role continua tendo que ser
-- 'operator'). O trigger profiles_protect_owner acima é quem
-- efetivamente impede qualquer um de tocar numa linha que já é owner —
-- esta policy só decide QUEM pode tentar e para QUAL role o resultado é
-- permitido.
create policy profiles_update_owner_or_admin
  on public.profiles for update
  to authenticated
  using (
    public.is_active_owner()
    or (public.is_active_admin() and role = 'operator')
  )
  with check (
    (public.is_active_owner() and role in ('admin', 'operator'))
    or (public.is_active_admin() and role = 'operator')
  );

-- Sem policy de delete — mesmo princípio das demais tabelas (Fase 17):
-- ativar/desativar é a única remoção oferecida (item 8 da Fase 19).

-- 7) audit_events — agora owner OU admin leem (antes só admin).
drop policy audit_events_select_admin on public.audit_events;

create policy audit_events_select_admin_owner
  on public.audit_events for select
  to authenticated
  using (public.is_active_admin_or_owner());

-- audit_events_insert_staff_own (Fase 17) não muda: qualquer staff ativo
-- insere em seu próprio nome, e is_active_staff() já foi redefinida acima
-- para incluir os 3 papéis novos.
