-- ALT-AUD-001: os dois pg_cron por minuto que chamam a Vercel só disparam o HTTP quando existe trabalho pendente.
-- Antes: 'edition-materias-worker' e 'agenda-telegram-reminders' faziam net.http_get TODO minuto (2 x 1.440 invocações/dia),
-- quase todas sem nada a fazer.
-- Agora: uma checagem SQL barata (mesmo predicado que a rota usa para escolher o trabalho, com folga) decide se chama.
--  * edição: mesma regra de claim_newspaper_editions_for_materias_work (queued, ou processing com lease de 10 min vencido);
--    a rota só processa o que essa função reivindica, então não há trabalho que a checagem não enxergue.
--  * agenda: compromisso 'scheduled' com lembrete cujo vencimento (início - reminder_minutes) caiu na janela de 10 min que a
--    rota usa, em America/Sao_Paulo, com 1 min de folga nas duas pontas (superconjunto: nunca perde lembrete).
-- ADITIVA: só substitui as duas funções (mesmas assinaturas, mesmo cron.job). Não altera tabelas, dados, RLS nem agenda.
-- A rota continua autenticada e idempotente (reserva UNIQUE / claim atômico); chamar a mais não duplica nada.
-- Reversão: recriar as funções de 20261014202640 e 20261121100000 (chamada incondicional).

create or replace function public.invoke_edition_materias_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare bearer text;
begin
  if not exists (
    select 1 from public.newspaper_editions e
     where e.materias_status = 'queued'
        or (e.materias_status = 'processing' and e.materias_started_at is not null
            and e.materias_started_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  select decrypted_secret into bearer from vault.decrypted_secrets
   where name = 'edition_materias_cron_secret' limit 1;
  if bearer is null or length(bearer) < 32 then
    raise exception 'Worker de separação de matérias não configurado no Vault (edition_materias_cron_secret).';
  end if;
  perform net.http_get(
    url := 'https://controle.altnix.com.br/api/cron/edition-materias',
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer),
    timeout_milliseconds := 60000
  );
end;
$fn$;
revoke all on function public.invoke_edition_materias_cron() from public, anon, authenticated;

create or replace function public.invoke_agenda_telegram_cron()
returns void language plpgsql security definer set search_path = ''
as $fn$
declare
  bearer text;
  cur timestamp := date_trunc('minute', now() at time zone 'America/Sao_Paulo');
begin
  if not exists (
    select 1 from public.agenda_events e
     where e.status = 'scheduled'
       and e.reminder_minutes is not null
       and e.start_time is not null
       and e.event_date between cur::date and cur::date + 1
       and (e.event_date + e.start_time) - make_interval(mins => e.reminder_minutes) <= cur + interval '1 minute'
       and (e.event_date + e.start_time) - make_interval(mins => e.reminder_minutes) + interval '11 minutes' > cur
  ) then
    return;
  end if;
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
