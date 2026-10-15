-- Ativacao somente apos publicar e testar /api/cron/notifications-push.
-- Reutiliza credencial do cron existente: nenhuma chave criada ou exposta.
create or replace function public.invoke_notification_push_cron()
returns void language plpgsql security definer set search_path = ''
as $$
declare bearer text;
begin
  select decrypted_secret into bearer
  from vault.decrypted_secrets
  where name='agenda_telegram_cron_secret'
  limit 1;
  if bearer is null or length(bearer)<32 then
    raise exception 'Cron push sem credencial';
  end if;
  perform net.http_get(
    url := 'https://controle.altnix.com.br/api/cron/notifications-push',
    headers := jsonb_build_object('Authorization','Bearer '||bearer),
    timeout_milliseconds := 14000
  );
end;
$$;
revoke all on function public.invoke_notification_push_cron() from public,anon,authenticated;
select cron.schedule('jornalir-push-dispatch','* * * * *',
  $$select public.invoke_notification_push_cron();$$);
