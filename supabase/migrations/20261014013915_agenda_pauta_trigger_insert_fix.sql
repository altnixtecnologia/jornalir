create or replace function public.set_agenda_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_agenda_event_actor() from public, anon, authenticated;

create or replace function public.set_weekly_pauta_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(auth.uid(), new.completed_by);
    elsif old.status is distinct from 'completed' then
      new.completed_at := now();
      new.completed_by := coalesce(auth.uid(), new.completed_by);
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_weekly_pauta_actor() from public, anon, authenticated;
