-- Agenda Jornal IR: cron nativo do Supabase, a cada minuto.
-- A credencial do endpoint deve ser cadastrada no Vault com o nome
-- agenda_telegram_cron_secret. Nunca inserir o valor em migrations.
do $schedule$
begin
  if not exists (
    select 1 from cron.job where jobname = 'agenda-telegram-reminders'
  ) then
    perform cron.schedule(
      'agenda-telegram-reminders',
      '* * * * *',
      'select public.invoke_agenda_telegram_cron();'
    );
  end if;
end;
$schedule$;
