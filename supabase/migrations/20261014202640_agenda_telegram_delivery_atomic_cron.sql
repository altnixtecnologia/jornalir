-- Lembretes Jornal IR: registro atomico de tentativas para evitar envio duplicado
alter table public.agenda_telegram_delivery
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed','uncertain'));
alter table public.agenda_telegram_delivery add column if not exists last_error text;
alter table public.agenda_telegram_delivery
  alter column sent_at drop not null,
  alter column sent_at drop default;
update public.agenda_telegram_delivery
  set delivery_status = 'sent' where sent_at is not null and delivery_status = 'pending';

create extension if not exists pg_net with schema extensions;
create or replace function public.invoke_agenda_telegram_cron()
returns void language plpgsql security definer set search_path = ''
as $fn$
declare bearer text;
begin
  select decrypted_secret into bearer from vault.decrypted_secrets
  where name = 'agenda_telegram_cron_secret' limit 1;
  if bearer is null or length(bearer) < 32 then
    raise exception 'Agenda cron nao configurado no Vault.';
  end if;
  perform net.http_get(
    url := 'https://controle.altnix.com.br/api/cron/agenda-telegram',
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer),
    timeout_milliseconds := 15000
  );
end;
$fn$;
revoke all on function public.invoke_agenda_telegram_cron() from public, anon, authenticated;
