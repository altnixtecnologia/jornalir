-- Disparo de notícia idempotente quando UMA matéria entra em "publicado".
create or replace function public.queue_article_push_on_publish()
returns trigger language plpgsql security definer set search_path=''
as $$
declare key text; mode text;
begin
  if new.status <> 'published' or (tg_op='UPDATE' and old.status='published') then
    return new;
  end if;
  mode:=coalesce(new.notification_mode,'none');
  if mode not in ('normal','urgent') then return new; end if;
  if new.slug is null or new.slug='' then return new; end if;

  key:='article:published:'||new.id::text;
  insert into public.notification_outbox(event_key,kind,title,body,href,due_at)
  values (
    key,
    case when mode='urgent' then 'urgent' else 'news' end,
    left(new.title,140),
    left(coalesce(new.subtitle,''),280),
    '/noticias/'||new.slug,
    now()
  )
  on conflict(event_key) do nothing;
  return new;
end $$;
revoke all on function public.queue_article_push_on_publish() from public,anon,authenticated;
drop trigger if exists article_push_on_published on public.articles;
create trigger article_push_on_published
after insert or update of status on public.articles
for each row execute function public.queue_article_push_on_publish();
;
