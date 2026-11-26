-- Seleção no novo cadastro, em uma transação. Reutiliza as duas RPCs auditadas.
begin;
create function public.save_client_with_informativo(p_client jsonb,p_roles text[])
returns uuid language plpgsql security invoker set search_path='' as $save$
declare v_id uuid;
begin
 if (select auth.uid()) is null or public.is_active_admin_or_owner() is distinct from true then
  raise exception 'Sem permissão para vincular o serviço.' using errcode='42501';
 end if;
 if p_client->>'status' is distinct from 'active' then
  raise exception 'Ative o cadastro antes de vincular o serviço.' using errcode='22023';
 end if;
 -- save_client mantém a validação de permissão de criação, identidade e papéis.
 v_id:=public.save_client(null::uuid,p_client,p_roles);
 if v_id is null or public.set_client_digital_export_permission(v_id,true) is distinct from true then
  raise exception 'Não foi possível vincular o serviço.' using errcode='22023';
 end if;
 return v_id;
end;
$save$;
revoke all on function public.save_client_with_informativo(jsonb,text[]) from public,anon,service_role;
grant execute on function public.save_client_with_informativo(jsonb,text[]) to authenticated;
commit;
