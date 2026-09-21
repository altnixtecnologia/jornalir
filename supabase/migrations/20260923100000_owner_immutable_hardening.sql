-- Fase 20 — endurece a imutabilidade do owner. A Fase 19 já bloqueava
-- alterar role/active/id de uma linha que já é owner; esta migration
-- fecha a brecha remanescente (outras colunas, como name, ainda podiam
-- ser alteradas). Incremental — não toca em nenhuma migration já
-- aplicada (Fases 17–19), só substitui o corpo da função de proteção já
-- criada na Fase 19 (mesmo nome/assinatura/trigger).

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

  -- UPDATE: nenhuma alteração é permitida numa linha que já é owner —
  -- não só role/active/id (Fase 19), qualquer coluna, inclusive name. A
  -- promoção inicial de alguém a owner continua possível: OLD.role ainda
  -- é 'operator'/'admin' nesse momento, então este bloqueio simplesmente
  -- não se aplica até a linha já SER owner.
  if OLD.role = 'owner' then
    raise exception 'O perfil do owner é imutável e não pode ser alterado pelo painel.';
  end if;

  return NEW;
end;
$$;

comment on function public.protect_owner_profile() is
  'Bloqueia QUALQUER UPDATE/DELETE numa linha que já é owner (endurecido na Fase 20 — a Fase 19 só bloqueava role/active/id). A promoção inicial a owner continua possível, pois OLD.role ainda não é owner nesse momento; só passa a ser travado depois.';

-- Nada mais muda nesta migration: o índice único de 1 owner
-- (profiles_single_owner), a policy de update que já impede admin de
-- alcançar uma linha role='owner' (profiles_update_owner_or_admin, Fase
-- 19) e o bloqueio de operator à gestão de usuários (mesma policy +
-- guarda de página no painel) já garantiam essas três regras desde a
-- Fase 19 — confirmados aqui só por leitura, não recriados.
