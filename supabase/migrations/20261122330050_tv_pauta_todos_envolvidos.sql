-- TV Pauta: exibir todos os envolvidos, sem duplicar nomes.
-- Preserva o contrato do snapshot usado pela TV autorizada e continua sem detalhe duplicado.
CREATE OR REPLACE FUNCTION public.tv_pauta_snapshot(p_token_hash text, p_focus_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_device uuid;v_week date;v_period_start date;v_period_end date;
 v_cards jsonb:='[]'::jsonb;v_total int:=0;v_completed int:=0;v_pending int:=0;
 r record;v_status text;v_field_done boolean;v_any_field_done boolean;
 v_detail text;v_member_detail text;v_writer text;v_field_owner text;v_people text;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null;end if;
 select id into v_device from public.tv_pauta_devices
  where token_hash=p_token_hash and revoked_at is null;
 if v_device is null then return null;end if;
 update public.tv_pauta_devices set last_seen_at=now()
  where id=v_device and (last_seen_at is null or last_seen_at<now()-interval '2 minutes');
 v_week:=public.pauta_week_start(coalesce(p_focus_date,(now() at time zone 'America/Sao_Paulo')::date));
 select coalesce(o.period_start,v_week),coalesce(o.period_end,v_week+6)
  into v_period_start,v_period_end from (select 1) q
   left join public.pauta_week_overrides o on o.week_start=v_week;
 for r in
   select q.id,q.title,q.due_date,q.status as pauta_status,
          q.agenda_event_id as pauta_event_id,q.responsible_profile_id,
          c.article_owner_id,c.attendance_owner_id,
          coalesce(pr.name,'Equipe') as responsible_name,
          c.event_id as coverage_id,c.team_mode,c.article_status,c.task_status,c.task_label,
          coalesce(ap.name,'Redação') as article_name,
          coalesce(fp.name,'Cobertura') as field_name
   from public.weekly_pauta_items q
   left join public.profiles pr on pr.id=q.responsible_profile_id
   left join public.event_coverages c on c.event_id=q.agenda_event_id
   left join public.profiles ap on ap.id=c.article_owner_id
   left join public.profiles fp on fp.id=c.attendance_owner_id
   where q.week_start=v_week
   order by q.sort_order,q.created_at
 loop
   v_status:='pending';
   v_detail:='Aguardando responsável';
   v_writer:=coalesce(r.article_name,r.responsible_name);
   -- Consultar cada perfil uma única vez: evita nomes repetidos entre
   -- responsabilidade editorial, participação e cobertura.
   select coalesce(string_agg(p.name,' · ' order by p.name),r.responsible_name)
     into v_people
   from public.profiles p
   where p.id=r.responsible_profile_id
      or (r.coverage_id is not null and p.id in (r.article_owner_id,r.attendance_owner_id))
      or exists (
       select 1 from public.agenda_event_assignees a
       where a.event_id=r.pauta_event_id and a.profile_id=p.id and a.assignment_type='responsible'
      )
      or exists (
       select 1 from public.event_coverage_members m
       where m.event_id=r.coverage_id and m.profile_id=p.id
      )
      or exists (
       select 1 from public.event_coverage_member_tasks mt
       where mt.event_id=r.coverage_id and mt.profile_id=p.id
      );

   if r.pauta_status='cancelled' then
     v_status:='cancelled';v_detail:='Cancelada';
   elsif r.coverage_id is not null then
     if r.team_mode then
       select coalesce(bool_and(m.completed_at is not null),true),
         coalesce(bool_or(m.completed_at is not null),false),
         coalesce(string_agg(m.task_label||': '||coalesce(p.name,'Colaborador'),' · '
            order by m.created_at) filter (where m.completed_at is null),'')
         into v_field_done,v_any_field_done,v_member_detail
         from public.event_coverage_member_tasks m
         left join public.profiles p on p.id=m.profile_id
         where m.event_id=r.coverage_id;
     else
       v_field_done:=r.task_status='completed';
       v_any_field_done:=v_field_done;
       v_member_detail:=case when not v_field_done then
         r.task_label||': '||r.field_name else '' end;
     end if;
     v_detail:=concat_ws(' · ',
       case when r.article_status<>'completed' then 'Matéria: '||r.article_name end,
       nullif(v_member_detail,''));
     if v_detail='' then v_detail:='Entregas concluídas';end if;
     if r.article_status='completed' and v_field_done then
       v_status:='completed';
     elsif r.article_status='completed' or v_any_field_done then
       v_status:='in_progress';
     end if;
   else
     v_status:=case when r.pauta_status='completed' then 'completed' else 'pending' end;
     v_detail:=case when v_status='completed' then 'Concluída' else 'Responsável: '||r.responsible_name end;
   end if;
   if v_status<>'cancelled' then
     v_total:=v_total+1;
     if v_status='completed' then v_completed:=v_completed+1;
     else v_pending:=v_pending+1;end if;
   end if;
   v_cards:=v_cards||jsonb_build_array(jsonb_build_object(
     'id',r.id,'title',r.title,'responsible',v_people,
     'detail','','date',r.due_date,'status',v_status));
 end loop;
 return jsonb_build_object('weekStart',v_week,'periodStart',v_period_start,
  'periodEnd',v_period_end,'cards',v_cards,'total',v_total,
  'completed',v_completed,'pending',v_pending,'generatedAt',now());
end;$function$;
