-- TV PAUTA: autorização interna por aparelho sem login/senha/PIN na televisão.
-- Tabelas são privadas: nenhum SELECT/INSERT/UPDATE via PostgREST para anon/authenticated.
-- A única API pública é RPC estreita, autenticada por segredo aleatório de 256 bits,
-- recebido exclusivamente em cookie HttpOnly; o navegador nunca recebe chave de serviço.

create table public.tv_pauta_pair_requests (
  id uuid primary key,
  code text not null check(code ~ '^[0-9]{6}$'),
  claim_hash text not null check(claim_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in('pending','approved','claimed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_label text check (approved_label is null or char_length(btrim(approved_label)) between 2 and 60)
);
create unique index tv_pauta_pending_code_idx on public.tv_pauta_pair_requests(code)
 where status='pending';
create index tv_pauta_pair_expiry_idx on public.tv_pauta_pair_requests(expires_at);

create table public.tv_pauta_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(btrim(name)) between 2 and 60),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  registered_by uuid not null references public.profiles(id),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id)
);
create index tv_pauta_devices_active_idx on public.tv_pauta_devices(revoked_at) where revoked_at is null;
alter table public.tv_pauta_pair_requests enable row level security;
alter table public.tv_pauta_devices enable row level security;
revoke all on public.tv_pauta_pair_requests,public.tv_pauta_devices from public,anon,authenticated;
grant all on public.tv_pauta_pair_requests,public.tv_pauta_devices to service_role;

create or replace function public.tv_pauta_is_manager()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_active_staff()
  and exists(select 1 from public.profiles p
   where p.id=auth.uid() and p.active and p.role in('owner','admin'))
$$;
revoke all on function public.tv_pauta_is_manager() from public,anon,authenticated;

create or replace function public.tv_pauta_pair_begin(
 p_id uuid,p_code text,p_claim_hash text
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_code !~ '^[0-9]{6}$'
   or p_claim_hash !~ '^[a-f0-9]{64}$' then return false;end if;
 -- Limite global anti-abuso para pedidos anônimos. Rejeita pressão contra o pareamento.
 perform pg_advisory_xact_lock(8390301);
 if (select count(*) from public.tv_pauta_pair_requests
     where created_at>now()-interval '1 minute')>=20 then
   return false;
 end if;
 update public.tv_pauta_pair_requests set status='expired'
  where status='pending' and expires_at<=now();
 insert into public.tv_pauta_pair_requests(id,code,claim_hash) values(p_id,p_code,p_claim_hash);
 return true;
exception when unique_violation then return false;
end;$$;
revoke all on function public.tv_pauta_pair_begin(uuid,text,text) from public,anon;
grant execute on function public.tv_pauta_pair_begin(uuid,text,text) to anon,authenticated;

create or replace function public.tv_pauta_pair_approve(p_code text,p_name text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.tv_pauta_is_manager() then
  raise exception 'Somente administração pode autorizar TV Pauta' using errcode='42501';
 end if;
 if p_code !~ '^[0-9]{6}$' or char_length(btrim(coalesce(p_name,''))) not between 2 and 60 then
   raise exception 'Informe o código de seis números e o nome do aparelho';
 end if;
 update public.tv_pauta_pair_requests set status='approved',
  approved_by=auth.uid(),approved_at=now(),approved_label=btrim(p_name)
 where code=p_code and status='pending' and expires_at>now();
 return found;
end;$$;
revoke all on function public.tv_pauta_pair_approve(text,text) from public,anon;
grant execute on function public.tv_pauta_pair_approve(text,text) to authenticated;

create or replace function public.tv_pauta_pair_claim(
 p_id uuid,p_claim_hash text,p_device_hash text
) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.tv_pauta_pair_requests%rowtype;
begin
 if p_id is null or p_claim_hash !~ '^[a-f0-9]{64}$'
    or p_device_hash !~ '^[a-f0-9]{64}$' then return false;end if;
 select * into r from public.tv_pauta_pair_requests
  where id=p_id and claim_hash=p_claim_hash for update;
 if not found or r.expires_at<=now() or r.status='claimed' then return false;end if;
 if r.status='pending' then return false;end if;
 if r.status<>'approved' or r.approved_by is null then return false;end if;
 insert into public.tv_pauta_devices(name,token_hash,registered_by)
 values(r.approved_label,p_device_hash,r.approved_by);
 update public.tv_pauta_pair_requests set status='claimed' where id=p_id;
 return true;
exception when unique_violation then return false;
end;$$;
revoke all on function public.tv_pauta_pair_claim(uuid,text,text) from public,anon;
grant execute on function public.tv_pauta_pair_claim(uuid,text,text) to anon,authenticated;

create or replace function public.tv_pauta_list_devices()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.tv_pauta_is_manager() then
  raise exception 'Sem permissão' using errcode='42501';end if;
 return jsonb_build_object(
  'devices',coalesce((select jsonb_agg(jsonb_build_object(
    'id',d.id,'name',d.name,'registeredAt',d.registered_at,
    'lastSeenAt',d.last_seen_at,'revokedAt',d.revoked_at
   ) order by d.registered_at desc) from public.tv_pauta_devices d),'[]'::jsonb),
  'pending',coalesce((select count(*) from public.tv_pauta_pair_requests
    where status='pending' and expires_at>now()),0)
 );
end;$$;
revoke all on function public.tv_pauta_list_devices() from public,anon;
grant execute on function public.tv_pauta_list_devices() to authenticated;

create or replace function public.tv_pauta_revoke(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.tv_pauta_is_manager() then
  raise exception 'Sem permissão' using errcode='42501';end if;
 update public.tv_pauta_devices set revoked_at=now(),revoked_by=auth.uid()
 where id=p_id and revoked_at is null;
 return found;
end;$$;
revoke all on function public.tv_pauta_revoke(uuid) from public,anon;
grant execute on function public.tv_pauta_revoke(uuid) to authenticated;

-- Projeção estritamente limitada a: título da pauta, responsáveis,
-- tarefas de campo, status e período editorial. Sem finanças, agenda privada
-- ou contatos. Revalidar a autorização a CADA leitura: revogar tem efeito imediato.
create or replace function public.tv_pauta_snapshot(p_token_hash text,p_focus_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_device uuid;v_week date;v_period_start date;v_period_end date;
 v_cards jsonb:='[]'::jsonb;v_total int:=0;v_completed int:=0;v_pending int:=0;
 r record;v_status text;v_field_done boolean;v_any_field_done boolean;
 v_detail text;v_member_detail text;v_writer text;v_field_owner text;
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
   if r.pauta_status='cancelled' then
     v_status:='cancelled';v_detail:='Cancelada';
   elsif r.coverage_id is not null then
     if r.team_mode then
       select coalesce(bool_and(m.field_completed_at is not null),true),
         coalesce(bool_or(m.field_completed_at is not null),false),
         coalesce(string_agg(m.field_task||': '||coalesce(p.name,'Colaborador'),' · '
             order by m.assigned_at),'')
        into v_field_done,v_any_field_done,v_member_detail
       from public.event_coverage_members m
       left join public.profiles p on p.id=m.profile_id
       where m.event_id=r.coverage_id and m.field_task is not null;
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
     'id',r.id,'title',r.title,'responsible',case when r.coverage_id is null
       then r.responsible_name else v_writer end,
     'detail',v_detail,'date',r.due_date,'status',v_status));
 end loop;
 return jsonb_build_object('weekStart',v_week,'periodStart',v_period_start,
  'periodEnd',v_period_end,'cards',v_cards,'total',v_total,
  'completed',v_completed,'pending',v_pending,'generatedAt',now());
end;$$;
revoke all on function public.tv_pauta_snapshot(text,date) from public,anon;
grant execute on function public.tv_pauta_snapshot(text,date) to anon,authenticated;
