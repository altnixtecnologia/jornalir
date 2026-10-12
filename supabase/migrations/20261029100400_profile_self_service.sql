-- "Meu perfil" (Fase "Meu perfil") — autoatendimento de QUALQUER usuário
-- autenticado sobre o PRÓPRIO nome. NÃO aplicada ainda (local apenas).
--
-- PROBLEMA: hoje não existe NENHUM caminho de self-service em
-- public.profiles. A policy profiles_update_owner_or_admin
-- (20260922100000) só permite: owner atualizar qualquer linha, ou admin
-- atualizar linhas role='operator' — um operator não pode alterar nem a
-- própria linha, e um admin não pode alterar a própria (sua linha é
-- role='admin', fora do que a policy cobre). Além disso o trigger
-- protect_owner_profile (20260923100000) bloqueia QUALQUER UPDATE numa
-- linha já owner, inclusive só o nome.
--
-- SOLUÇÃO: uma RPC estreita, SECURITY DEFINER, que só altera `name` e só
-- da PRÓPRIA linha (auth.uid()) — nunca aceita um id de outro usuário,
-- nunca toca role/active/email. Preserva 100% as regras já existentes de
-- quem pode promover/rebaixar/ativar outra pessoa (profiles_update_owner_or_admin
-- continua intocada).
--
-- O trigger protect_owner_profile precisa de um ajuste MÍNIMO: permitir
-- que uma linha já owner tenha só `name` alterado (nunca id/role/active/
-- created_at, que continuam 100% bloqueados mesmo para o próprio owner;
-- updated_at segue mudando só pelo trigger profiles_set_updated_at já
-- existente) — sem isso, o próprio owner não conseguiria renomear a si
-- mesmo via esta RPC. A policy de UPDATE já garante que só o PRÓPRIO
-- owner passa pelo `using()` numa linha role='owner' (admin só alcança
-- linhas role='operator'), então esta folga não abre a porta pra mais
-- ninguém alterar a linha do owner.
create or replace function public.protect_owner_profile()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.role = 'owner' then
      raise exception 'O perfil do owner é imutável e não pode ser removido pelo painel.';
    end if;
    return OLD;
  end if;

  if OLD.role = 'owner' then
    if NEW.role is distinct from OLD.role
       or NEW.active is distinct from OLD.active
       or NEW.id is distinct from OLD.id
       or NEW.created_at is distinct from OLD.created_at then
      raise exception 'O perfil do owner é imutável e não pode ser alterado pelo painel.';
    end if;
    -- Só name pode mudar numa linha já owner — autoatendimento do próprio
    -- nome (ver update_own_profile_name abaixo). updated_at muda só pelo
    -- trigger já existente (profiles_set_updated_at), nunca escrito aqui
    -- nem pela RPC diretamente.
    return NEW;
  end if;

  return NEW;
end;
$$;

comment on function public.protect_owner_profile() is
  'Bloqueia qualquer UPDATE/DELETE de id/role/active/created_at numa linha que já é owner; só name pode mudar (autoatendimento via update_own_profile_name, updated_at seguindo o trigger profiles_set_updated_at já existente) — ajuste da Fase "Meu perfil" sobre o endurecimento original da Fase 20.';

-- RPC de autoatendimento — a ÚNICA forma de qualquer usuário (owner,
-- admin ou operator) alterar o próprio nome. Nunca aceita id de outro
-- usuário como parâmetro: sempre auth.uid(). SECURITY DEFINER só para
-- poder escrever numa linha owner (bypassa profiles_update_owner_or_admin
-- quando o próprio owner chama) — mas a cláusula `where id = auth.uid()`
-- já é, por si só, o limite real de segurança (nunca lê/escreve a linha
-- de outra pessoa, mesmo rodando com privilégio elevado).
create or replace function public.update_own_profile_name(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'update_own_profile_name: requer usuário autenticado.';
  end if;
  if v_name = '' then
    raise exception 'Nome não pode ser vazio.';
  end if;

  update public.profiles
    set name = v_name
    where id = auth.uid()
    returning * into v_row;

  if v_row.id is null then
    raise exception 'Perfil não encontrado para o usuário autenticado.';
  end if;

  return v_row;
end;
$$;

comment on function public.update_own_profile_name(text) is
  'Autoatendimento — altera SOMENTE o name da PRÓPRIA linha (auth.uid()), nunca de outro usuário, nunca role/active/email. Usado pela tela /sistema/perfil, disponível para qualquer papel.';

-- Revoga explicitamente de public/anon (CREATE FUNCTION concede EXECUTE a
-- PUBLIC por padrão) antes de conceder só a authenticated — nunca
-- confiar no padrão implícito do Postgres para uma função SECURITY
-- DEFINER que escreve dados.
revoke all on function public.update_own_profile_name(text) from public;
revoke all on function public.update_own_profile_name(text) from anon;
grant execute on function public.update_own_profile_name(text) to authenticated;
