-- Convites internos: ambiente Supabase efêmero, nenhuma notificação real.
begin;
do $seed$
declare
 manager_id uuid:=gen_random_uuid();
 invitee_id uuid:=gen_random_uuid();
 outsider_id uuid:=gen_random_uuid();
 event_id uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values
 (manager_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'agenda-owner-'||manager_id::text||'@example.invalid',now(),'{"name":"Gerente QA"}'::jsonb),
 (invitee_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'agenda-invitee-'||invitee_id::text||'@example.invalid',now(),'{"name":"Convidado QA"}'::jsonb),
 (outsider_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'agenda-outsider-'||outsider_id::text||'@example.invalid',now(),'{"name":"Externo QA"}'::jsonb);
 update public.profiles set role='owner',active=true where id=manager_id;
 update public.profiles set role='operator',active=true where id in (invitee_id,outsider_id);
 insert into public.staff_memberships(profile_id)
 values(manager_id),(invitee_id);
 insert into public.agenda_events(title,event_date,event_kind,status,created_by,updated_by)
 values('Reunião de homologação',current_date,'general','scheduled',manager_id,manager_id)
 returning id into event_id;
 perform set_config('qa.agenda.manager',manager_id::text,true);
 perform set_config('qa.agenda.invitee',invitee_id::text,true);
 perform set_config('qa.agenda.outsider',outsider_id::text,true);
 perform set_config('qa.agenda.event',event_id::text,true);
end;
$seed$;

set local role authenticated;
do $run$
declare
 manager_id uuid:=current_setting('qa.agenda.manager')::uuid;
 invitee_id uuid:=current_setting('qa.agenda.invitee')::uuid;
 outsider_id uuid:=current_setting('qa.agenda.outsider')::uuid;
 v_event_id uuid:=current_setting('qa.agenda.event')::uuid;
 count_n int; response_time timestamptz; repeated_time timestamptz;
 denied boolean;
begin
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if not public.is_agenda_manager() then
  raise exception 'Owner não possui acesso de gestão de agenda no teste.';
 end if;
 select public.set_agenda_event_invitees(v_event_id,array[invitee_id]) into count_n;
 if count_n<>1 then raise exception 'Convite não criado.'; end if;
 select public.set_agenda_event_invitees(v_event_id,array[invitee_id,invitee_id]) into count_n;
 if count_n<>1 then raise exception 'Convite duplicado pelo reenvio.'; end if;
 denied:=false;
 begin
  perform public.set_agenda_event_invitees(v_event_id,array[outsider_id]);
 exception when invalid_parameter_value then denied:=true;
 end;
 if not denied then raise exception 'Perfil externo sem membership pôde ser convidado.'; end if;
 -- Participante tem leitura do próprio convite, mas nunca edita direto.
 perform set_config('request.jwt.claim.sub',invitee_id::text,true);
 select count(*) into count_n from public.agenda_event_invitees i
 where i.event_id=v_event_id and i.profile_id=invitee_id;
 -- RLS deve permitir apenas o próprio convite.
 if count_n<>1 then raise exception 'Convidado não visualiza sua presença.'; end if;
 denied:=false;
 begin
  update public.agenda_event_invitees set status='accepted' where profile_id=invitee_id;
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'PATCH direto alterou status de convite.'; end if;
 if not public.respond_agenda_event_invitation(v_event_id,'accepted') then
  raise exception 'Aceite não confirmado.'; end if;
 select i.responded_at into response_time from public.agenda_event_invitees i
  where i.event_id=v_event_id and i.profile_id=invitee_id;
 perform pg_sleep(0.01);
 perform public.respond_agenda_event_invitation(v_event_id,'accepted');
 select i.responded_at into repeated_time from public.agenda_event_invitees i
  where i.event_id=v_event_id and i.profile_id=invitee_id;
 if repeated_time is distinct from response_time then
  raise exception 'Retry alterou data de resposta idempotente.'; end if;
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 denied:=false;
 begin
  perform public.respond_agenda_event_invitation(v_event_id,'declined');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Terceiro respondeu convite de outra pessoa.'; end if;
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 select public.set_agenda_event_invitees(v_event_id,array[invitee_id]) into count_n;
 select count(*) into count_n from public.agenda_event_invitees i
 where i.event_id=v_event_id and i.profile_id=invitee_id
   and i.status='accepted' and i.responded_at=response_time;
 if count_n<>1 then raise exception 'Reconvite apagou aceite anterior.'; end if;
 select public.set_agenda_event_invitees(v_event_id,array[]::uuid[]) into count_n;
 if count_n<>0 then raise exception 'Remoção de convite não funcionou.'; end if;
end;
$run$;
reset role;
-- Encerramento é uma operação de banco em ambiente descartável.
update public.agenda_events set status='completed',completed_at=now()
 where id=current_setting('qa.agenda.event')::uuid;
set local role authenticated;
do $completed$
declare
 v_event_id uuid:=current_setting('qa.agenda.event')::uuid;
 invitee_id uuid:=current_setting('qa.agenda.invitee')::uuid;
 denied boolean:=false;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.agenda.manager'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  perform public.set_agenda_event_invitees(v_event_id,array[invitee_id]);
 exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Reunião concluída recebeu novo convite.'; end if;
end;
$completed$;
reset role;
rollback;
select 'PASSOU: convite interno autorizado, status por convidado, retry idempotente e bloqueio de terceiros' as resultado;
