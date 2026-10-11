-- Garante o papel `assinante` em client_roles ao criar uma assinatura —
-- sem depender da UI/Server Action chamar save_client() de novo depois.
-- Incremental sobre 20261025100200_birthday_edition_messages.sql. NÃO
-- aplicada ainda.
--
-- DESENHO: trigger AFTER INSERT em public.subscriptions, não uma chamada
-- de aplicação. Motivo: "funcionar para qualquer origem legítima de
-- criação da assinatura" — hoje subscriptionRepository.supabase.ts.create()
-- faz um INSERT direto (sem RPC), então um trigger é o único lugar que
-- garante a regra independente de QUEM faz o INSERT (Server Action atual,
-- uma RPC futura, ou acesso administrativo direto). Idempotente via
-- `ON CONFLICT DO NOTHING` sobre a unique já existente
-- (client_roles_unique_per_client, de 20261011100000_clients.sql) — nunca
-- duplica `assinante`, nunca toca/remove outros papéis.
--
-- SECURITY INVOKER (não DEFINER) — avaliado e descartado: quem tem
-- permissão de inserir em subscriptions (is_active_staff(), ver
-- subscriptions_insert_staff em 20261015100000_subscriptions.sql) também
-- tem permissão de inserir em client_roles (mesmo is_active_staff(), ver
-- client_roles_insert_staff em 20261011100000_clients.sql) — não há
-- privilégio faltando que justifique rodar como owner da função. Função
-- mínima, search_path explícito, nenhuma superfície de escalonamento.
--
-- Cancelar assinatura (UPDATE de status) NUNCA remove o papel — este
-- trigger só existe em AFTER INSERT, nunca em UPDATE/DELETE.

create or replace function public.ensure_subscriber_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.client_roles (client_id, role)
  values (new.client_id, 'assinante')
  on conflict (client_id, role) do nothing;
  return new;
end;
$$;

comment on function public.ensure_subscriber_role() is
  'Garante client_roles.role = assinante para o client_id de toda nova assinatura — idempotente (ON CONFLICT DO NOTHING), nunca remove outros papéis, nunca roda em UPDATE/DELETE (cancelar assinatura não remove o papel).';

create trigger subscriptions_ensure_subscriber_role
  after insert on public.subscriptions
  for each row
  execute function public.ensure_subscriber_role();

-- Backfill idempotente — todo client_id que já tem assinatura hoje passa a
-- ter o papel assinante, sem tocar nos demais papéis já cadastrados.
insert into public.client_roles (client_id, role)
select distinct client_id, 'assinante'
from public.subscriptions
on conflict (client_id, role) do nothing;
