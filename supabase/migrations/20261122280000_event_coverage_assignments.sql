-- A mesma cobertura tem duas entregas editoriais independentes: registro de campo e texto.
-- Somente os eventos que adotarem Cobertura têm a nova etapa; compromissos legados permanecem iguais.
alter table public.event_coverages
  add column task_label text not null default 'Fotos / cobertura',
  add column task_status text not null default 'pending',
  add column task_completed_at timestamptz;
alter table public.event_coverages
  add constraint event_coverages_task_label_length check (char_length(btrim(task_label)) between 2 and 80),
  add constraint event_coverages_task_status_check check (task_status in ('pending','completed'));

-- Quem foi designado ao trabalho de campo (normalmente fotos) conclui somente
-- sua entrega, sem concluir a redação atribuída a outra pessoa.
create function public.set_event_coverage_task(p_event_id uuid,p_completed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.event_coverages%rowtype; e public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
   raise exception 'Sem acesso ativo' using errcode='42501'; end if;
 select * into c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if auth.uid()<>c.attendance_owner_id and not public.is_agenda_manager() then
   raise exception 'Somente responsável pela cobertura ou gestor pode concluir a tarefa' using errcode='42501'; end if;
 select * into e from public.agenda_events where id=p_event_id for update;
 if e.status='cancelled' then raise exception 'Evento cancelado'; end if;
 update public.event_coverages set task_status=case when p_completed then 'completed' else 'pending' end,
   task_completed_at=case when p_completed then coalesce(task_completed_at,now()) else null end,
   updated_by=auth.uid(),updated_at=now()
 where event_id=p_event_id;
 update public.agenda_events set
   status=case when p_completed and c.article_status='completed' then 'completed' else 'scheduled' end,
   completed_at=case when p_completed and c.article_status='completed' then coalesce(completed_at,now()) else null end,
   updated_by=auth.uid(),updated_at=now()
 where id=p_event_id;
 return true;
end;$$;
revoke all on function public.set_event_coverage_task(uuid,boolean) from public,anon;
grant execute on function public.set_event_coverage_task(uuid,boolean) to authenticated;

-- Alterar a função da pessoa (Fotos, Entrevistas, Vídeo, Cobertura geral,
-- etc.) reinicia apenas essa tarefa se a atividade realmente mudou.
create function public.set_event_coverage_task_label(p_event_id uuid,p_label text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.event_coverages%rowtype;v_label text;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501'; end if;
 select * into c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if auth.uid()<>c.attendance_owner_id and not public.is_agenda_manager() then
  raise exception 'Apenas responsável ou gestor pode editar a tarefa' using errcode='42501'; end if;
 v_label:=btrim(coalesce(p_label,''));
 if char_length(v_label) not between 2 and 80 then raise exception 'Informe uma tarefa com 2 a 80 caracteres';end if;
 if c.task_label IS NOT DISTINCT FROM v_label then return true; end if;
 update public.event_coverages set task_label=v_label,task_status='pending',task_completed_at=null,
 updated_by=auth.uid(),updated_at=now() where event_id=p_event_id;
 update public.agenda_events set status='scheduled',completed_at=null,updated_by=auth.uid(),updated_at=now()
 where id=p_event_id and status='completed';
 return true;
end;$$;
revoke all on function public.set_event_coverage_task_label(uuid,text) from public,anon;
grant execute on function public.set_event_coverage_task_label(uuid,text) to authenticated;

-- A matéria concluída não encerra o evento se as fotos/entrevistas ainda não
-- estiverem prontas. E o registro de campo não conclui a matéria.
create or replace function public.set_event_coverage_article(p_event_id uuid,p_completed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.event_coverages%rowtype; e public.agenda_events%rowtype;
begin
 if auth.uid() is null or not public.is_active_staff() then
  raise exception 'Sem acesso' using errcode='42501';end if;
 select * into c from public.event_coverages where event_id=p_event_id for update;
 if not found then raise exception 'Cobertura não encontrada'; end if;
 if auth.uid()<>c.article_owner_id and not public.is_agenda_manager() then
  raise exception 'Somente redator ou gestor pode concluir a matéria' using errcode='42501';end if;
 select * into e from public.agenda_events where id=p_event_id for update;
 if e.status='cancelled' then raise exception 'Evento cancelado'; end if;
 update public.event_coverages
  set article_status=case when p_completed then 'completed' else 'pending' end,
  article_completed_at=case when p_completed then coalesce(article_completed_at,now()) else null end,
  updated_by=auth.uid(),updated_at=now()
 where event_id=p_event_id;
 update public.agenda_events set
  status=case when p_completed and c.task_status='completed' then 'completed' else 'scheduled' end,
  completed_at=case when p_completed and c.task_status='completed' then coalesce(completed_at,now()) else null end,
  updated_by=auth.uid(),updated_at=now()
 where id=p_event_id;
 return true;
end;$$;

-- Bloqueia botões legados que tentariam finalizar antes de fotos e matéria.
create or replace function public.guard_coverage_before_agenda_complete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed'
    and exists(select 1 from public.event_coverages c
      where c.event_id=new.id and (c.article_status<>'completed' or c.task_status<>'completed')) then
   raise exception 'Cobertura ainda pendente: conclua a tarefa de campo e a matéria.';
 end if;
 return new;
end;$$;

-- Após transferência de presença, a entrega de campo pertence ao novo titular.
-- Se já estava marcada como concluída, preservar o registro de conclusão:
-- só reabrir se estiver pendente para evitar perder evidência histórica.
create or replace function public.apply_event_coverage_transfer(p_transfer uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.event_coverage_transfers%rowtype;c public.event_coverages%rowtype;
begin
 select * into t from public.event_coverage_transfers where id=p_transfer for update;
 if not found or t.status not in ('accepted','forced') then raise exception 'Transferência não autorizada';end if;
 select * into c from public.event_coverages where event_id=t.event_id for update;
 if c.attendance_owner_id is distinct from t.from_attendance_id or
    c.article_owner_id is distinct from t.from_article_id then
    raise exception 'Responsabilidade alterada; atualize a cobertura'; end if;
 update public.event_coverages set
   attendance_owner_id=case when t.transfer_part in ('attendance','both') then t.to_profile_id else attendance_owner_id end,
   article_owner_id=case when t.transfer_part in ('article','both') then t.to_profile_id else article_owner_id end,
   attendance_status=case when t.transfer_part in ('attendance','both') then 'pending' else attendance_status end,
   attendance_at=case when t.transfer_part in ('attendance','both') then null else attendance_at end,
   updated_by=coalesce(auth.uid(),t.decided_by),updated_at=now(),revision=revision+1
 where event_id=t.event_id;
 insert into public.agenda_event_assignees(event_id,profile_id,assignment_type)
 values(t.event_id,t.to_profile_id,'responsible')
 on conflict(event_id,profile_id) do nothing;
 delete from public.agenda_event_assignees a
 where a.event_id=t.event_id and a.profile_id in(t.from_attendance_id,t.from_article_id)
 and not exists(select 1 from public.event_coverages c
   where c.event_id=a.event_id and a.profile_id in(c.attendance_owner_id,c.article_owner_id));
 update public.weekly_pauta_items
 set responsible_profile_id=(select attendance_owner_id from public.event_coverages where event_id=t.event_id)
 where agenda_event_id=t.event_id;
 return true;
end;$$;

-- RPCs de criação em única transação com nome de tarefa opcional.
create function public.create_coverage_for_event_with_task(
 p_event_id uuid,p_attendance_owner uuid,p_article_owner uuid,
 p_audible_minutes integer,p_checkin_minutes integer,p_task_label text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 v:=public.create_coverage_for_event(p_event_id,p_attendance_owner,p_article_owner,p_audible_minutes,p_checkin_minutes,null);
 perform public.set_event_coverage_task_label(v,p_task_label);
 return v;
end;$$;
revoke all on function public.create_coverage_for_event_with_task(uuid,uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.create_coverage_for_event_with_task(uuid,uuid,uuid,integer,integer,text) to authenticated;

create function public.create_coverage_agenda_with_task(
 p_title text,p_description text,p_event_date date,p_start_time time,
 p_end_time time,p_location text,p_attendance_owner uuid,p_article_owner uuid,
 p_audible_minutes integer,p_checkin_minutes integer,p_task_label text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 v:=public.create_coverage_agenda(p_title,p_description,p_event_date,p_start_time,p_end_time,
   p_location,p_attendance_owner,p_article_owner,p_audible_minutes,p_checkin_minutes);
 perform public.set_event_coverage_task_label(v,p_task_label);
 return v;
end;$$;
revoke all on function public.create_coverage_agenda_with_task(text,text,date,time,time,text,uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.create_coverage_agenda_with_task(text,text,date,time,time,text,uuid,uuid,integer,integer,text) to authenticated;

create function public.create_coverage_pauta_with_task(
 p_title text,p_description text,p_event_date date,p_start_time time,
 p_profiles uuid[],p_week_start date,p_show_in_agenda boolean,
 p_attendance_owner uuid,p_article_owner uuid,p_audible_minutes integer,
 p_checkin_minutes integer,p_task_label text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;e uuid;
begin
 v:=public.create_coverage_pauta(p_title,p_description,p_event_date,p_start_time,
   p_profiles,p_week_start,p_show_in_agenda,p_attendance_owner,p_article_owner,
   p_audible_minutes,p_checkin_minutes);
 select agenda_event_id into e from public.weekly_pauta_items where id=v;
 if e is null then raise exception 'Pauta sem compromisso relacionado';end if;
 perform public.set_event_coverage_task_label(e,p_task_label);
 return v;
end;$$;
revoke all on function public.create_coverage_pauta_with_task(text,text,date,time,uuid[],date,boolean,uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.create_coverage_pauta_with_task(text,text,date,time,uuid[],date,boolean,uuid,uuid,integer,integer,text) to authenticated;
