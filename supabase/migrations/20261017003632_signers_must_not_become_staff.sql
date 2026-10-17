-- Usuários externos criados SOMENTE para assinar não podem virar operadores.
-- Mudança pontual no trigger existente; convites administrativos continuam
-- usando o fluxo anterior de ativação e permissão.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'operator',
    case
      when new.raw_user_meta_data ->> 'account_purpose' = 'contract_signer'
      then false
      else true
    end
  );
  return new;
end;
$$;
comment on function public.handle_new_auth_user() is
  'Signatário externo (account_purpose=contract_signer) inicia inativo e não acessa o sistema.';
;
