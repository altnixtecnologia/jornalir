-- Rate limit dedicado para /api/public/notifications (18/10/2026).
--
-- PENDENTE DE APLICAÇÃO (ver nota em 20261030100500/100600). Encontrado na
-- auditoria de segurança deste lote: a rota de leitura/marcar-como-lido da
-- central de notificações não tinha limite de tentativas por IP, ao
-- contrário de /api/public/push (que já usa site_push_rate_limits +
-- claim_site_push_registration). Mesmo modelo, bucket e limite próprios —
-- não reaproveita a cota de registro de push, que é para outra finalidade.

create table if not exists public.site_notifications_rate_limits (
  client_hash text not null,
  hour_bucket timestamptz not null,
  attempts integer not null default 0,
  primary key (client_hash, hour_bucket)
);

alter table public.site_notifications_rate_limits enable row level security;
revoke all on public.site_notifications_rate_limits from anon, authenticated;

-- Limite generoso o bastante para uso normal (poll a cada 2 min = ~30
-- leituras/hora, mais algumas marcações de lido), mas baixo o bastante
-- para não permitir inundar a tabela site_notification_reads com hashes
-- fabricados.
create or replace function public.claim_site_notifications_action(p_client_hash text, p_limit integer default 120)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare total integer;
begin
  if octet_length(p_client_hash) <> 64 or p_client_hash !~ '^[a-f0-9]+$' then
    raise exception 'Identificador inválido';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Limite inválido';
  end if;
  insert into public.site_notifications_rate_limits(client_hash, hour_bucket, attempts)
  values (p_client_hash, date_trunc('hour', now()), 1)
  on conflict (client_hash, hour_bucket) do update
  set attempts = public.site_notifications_rate_limits.attempts + 1
  returning attempts into total;
  return total <= p_limit;
end
$$;

revoke all on function public.claim_site_notifications_action(text, integer) from public, anon, authenticated;
grant execute on function public.claim_site_notifications_action(text, integer) to service_role;
