-- Segurança: usuários criados via OTP, inclusive signatários comerciais
-- externos, NÃO podem obter por padrão um perfil ativo do painel.
-- raw_user_meta_data é controlável pelo usuário: nunca autoriza staff.
-- A ativação de staff é feita APÓS convite administrativo no servidor.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path='' as $authprofile$
declare
  v_name text;
  v_email_prefix text;
begin
  v_name := regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'name','')), '[[:space:]]+', ' ', 'g');
  v_email_prefix := split_part(coalesce(new.email,''),'@',1);
  if length(v_name)<3 or length(v_name)>120 or
     lower(v_name)=lower(v_email_prefix) or position('@' in v_name)>0 then
    v_name := 'Nome não informado';
  end if;
  insert into public.profiles(id,name,role,active)
  values(new.id,v_name,'operator',false);
  return new;
end;
$authprofile$;

-- Não mudar perfis já existentes em produção. Seu estado exige
-- revisão administrativa caso a origem da conta seja desconhecida.
comment on function public.handle_new_auth_user() is
  'Qualquer novo Auth user nasce com perfil operator INATIVO. Apenas o fluxo administrativo autenticado pode ativar staff. Tokens OTP ou user_metadata nunca liberam o painel.';
