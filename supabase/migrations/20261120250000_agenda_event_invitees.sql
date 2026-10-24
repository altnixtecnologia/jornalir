-- Agenda: convites internos com aceite/recusa independente de conclusão
-- de tarefas e de agenda_event_assignees. Nenhuma mensagem é disparada.
create table public.agenda_event_invitees(
 event_id uuid not null references public.agenda_events(id) on delete cascade,
 profile_id uuid not null references public.profiles(id),
 status text not null default 'pending'
   check(status in ('pending','accepted','declined')),
 invited_by uuid references public.profiles(id),
 invited_at timestamptz not null default now(),
 responded_at timestamptz,
 primary key(event_id,profile_id),
 constraint agenda_invite_response_consistency check(
   (status='pending' and responded_at is null) or
   (status in ('accepted','declined') and responded_at is not null)
 )
);
create index agenda_event_invitees_profile_idx
 on public.agenda_event_invitees(profile_id,status,invited_at desc);
alter table public.agenda_event_invitees enable row level security;
grant select on public.agenda_event_invitees to authenticated;
revoke insert,update,delete on public.agenda_event_invitees from public,anon,authenticated;
create policy agenda_invitees_read on public.agenda_event_invitees
 for select to authenticated using(
 public.is_active_staff() and
 (profile_id=auth.uid() or public.is_agenda_manager())
);

-- Organizador ajusta convidado(s) de um compromisso já criado.
-- Trava o compromisso e preserva respostas existentes de quem continua.
create function public.set_agenda_event_invitees(p_event_id uuid,p_profile_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $fn$
declare v_event public.agenda_events; v_count integer;
begin
 if not public.is_agenda_manager()
 then raise exception 'Sem permissão para convidar equipe.' using errcode='42501'; end if;
 if p_event_id is null or p_profile_ids is null or
    cardinality(p_profile_ids)>50 or array_position(p_profile_ids,null) is not null
 then raise exception 'Lista de convidados inválida.' using errcode='22023'; end if;
 select * into v_event from public.agenda_events where id=p_event_id for update;
 if not found or v_event.status<>'scheduled' or v_event.event_kind<>'general'
 then raise exception 'Só é possível convidar para compromisso geral agendado.' using errcode='22023'; end if;
 if exists(
  select 1 from (select distinct id from unnest(p_profile_ids) id) x
  left join public.profiles p on p.id=x.id and p.active=true
  left join public.staff_memberships m on m.profile_id=p.id
  where p.id is null or m.profile_id is null
 ) then raise exception 'Convidado inexistente ou inativo.' using errcode='22023'; end if;
 delete from public.agenda_event_invitees i
 where i.event_id=p_event_id and not(i.profile_id=any(p_profile_ids));
 insert into public.agenda_event_invitees(event_id,profile_id,invited_by)
 select p_event_id, x.id, auth.uid()
 from (select distinct id from unnest(p_profile_ids) id) x
 on conflict(event_id,profile_id) do nothing;
 select count(*) into v_count from public.agenda_event_invitees where event_id=p_event_id;
 return v_count;
end;
$fn$;
revoke all on function public.set_agenda_event_invitees(uuid,uuid[]) from public,anon;
grant execute on function public.set_agenda_event_invitees(uuid,uuid[]) to authenticated;

create function public.respond_agenda_event_invitation(p_event_id uuid,p_response text)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_status text; v_event_status text;
begin
 if auth.uid() is null or not public.is_active_staff()
 then raise exception 'Sessão inválida para responder.' using errcode='42501'; end if;
 if p_response not in ('accepted','declined') or p_response is null
 then raise exception 'Resposta deve ser aceite ou recusa.' using errcode='22023'; end if;
 select e.status into v_event_status from public.agenda_events e
 where e.id=p_event_id for share;
 if v_event_status is distinct from 'scheduled'
 then raise exception 'O compromisso não está mais agendado.' using errcode='22023'; end if;
 select i.status into v_status from public.agenda_event_invitees i
 where i.event_id=p_event_id and i.profile_id=auth.uid() for update;
 if not found then raise exception 'Nenhum convite pendente para este usuário.' using errcode='42501'; end if;
 if v_status is distinct from p_response then
  update public.agenda_event_invitees
  set status=p_response,responded_at=clock_timestamp()
  where event_id=p_event_id and profile_id=auth.uid();
 end if;
 return true;
end;
$fn$;
revoke all on function public.respond_agenda_event_invitation(uuid,text) from public,anon;
grant execute on function public.respond_agenda_event_invitation(uuid,text) to authenticated;
comment on table public.agenda_event_invitees is
 'Convite interno a reunião, com status por pessoa; não implica Telegram/WhatsApp/email entregue. Resposta independente de tarefa concluída.';
