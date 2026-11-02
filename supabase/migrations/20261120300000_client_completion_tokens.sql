-- Bloco B — Cadastro complementar (02/11/2026): link individual seguro
-- para o interessado completar o próprio cadastro. NÃO aplicada ainda
-- (regra de trabalho vigente: desenvolver agora, aplicar depois — mesmo
-- princípio de 20261025100100_birthday_entries.sql). A página pública que
-- consome este token (apps/site) e o envio real do link (WhatsApp/
-- e-mail) ficam para um lote seguinte, explicitamente fora deste —
-- aqui só a infraestrutura segura do token e da verificação de posse de
-- canal, para a equipe já poder gerar o link manualmente em IR Controle.
--
-- Padrão reaproveitado de public.commercial_signature_invitations/
-- commercial_signature_attempts (token_sha256 com hash, nunca o token em
-- claro; expires_at; rate limit de "código" com os MESMOS números já
-- aprovados: 60s entre pedidos, janela de 24h, máx 8/dia).
--
-- VERIFICAÇÃO DE POSSE DE CANAL — "antes de permitir visualizar ou
-- modificar dados já existentes, exigir verificação de posse de um canal
-- previamente confirmado". channel_value grava o telefone/e-mail que
-- estava no cadastro NO MOMENTO em que o link foi gerado (snapshot) —
-- mesmo que o cadastro seja editado depois, a verificação do token
-- continua contra o canal que realmente recebeu o link. A verificação em
-- si (enviar/confirmar um código) é delegada ao Supabase Auth (OTP por
-- e-mail/telefone), do mesmo jeito que a assinatura comercial delega —
-- esta tabela só guarda o resultado (verified_at/verified_user_id) e o
-- rate limit de pedidos, nunca um código em claro.
create table public.client_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,

  channel text not null check (channel in ('whatsapp', 'email')),
  channel_value text not null,

  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'completed', 'expired', 'revoked')),

  expires_at timestamptz not null,
  verified_user_id uuid references auth.users (id),
  verified_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,

  last_otp_requested_at timestamptz,
  otp_requests_count integer not null default 0 check (otp_requests_count between 0 and 8),
  otp_window_started_at timestamptz,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint client_completion_tokens_channel_value_length check (char_length(btrim(channel_value)) between 3 and 180),
  constraint client_completion_tokens_verified_fields check (
    (status not in ('verified', 'completed')) or (verified_user_id is not null and verified_at is not null)
  )
);

comment on table public.client_completion_tokens is
  'Token de link individual para o interessado completar o próprio cadastro. token_sha256 nunca o token em claro — mesmo princípio de commercial_signature_invitations. NÃO aplicada ainda; página pública de consumo fica para lote seguinte.';
comment on column public.client_completion_tokens.channel_value is
  'Snapshot do telefone/e-mail do cliente no momento em que o link foi gerado — a verificação de posse sempre confere contra este valor, mesmo que o cadastro seja editado depois.';

create index client_completion_tokens_client_id_idx on public.client_completion_tokens (client_id);
create unique index client_completion_tokens_single_active_idx
  on public.client_completion_tokens (client_id)
  where status in ('pending', 'verified');

alter table public.client_completion_tokens enable row level security;
revoke all on public.client_completion_tokens from public, anon, authenticated;
grant select on public.client_completion_tokens to authenticated;

create policy client_completion_tokens_select_staff
  on public.client_completion_tokens for select
  to authenticated
  using (public.is_active_staff());

-- Geração do link — chamada pela equipe autenticada em IR Controle.
-- Retorna o token em claro UMA ÚNICA VEZ (a própria resposta da RPC);
-- o banco nunca mais consegue devolvê-lo depois (só guarda o hash).
create or replace function public.generate_client_completion_token(
  p_client_id uuid,
  p_channel text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_channel_value text;
  v_token text;
begin
  if not public.is_active_staff() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_channel not in ('whatsapp', 'email') then
    raise exception 'Canal inválido.' using errcode = '23514';
  end if;

  select id, whatsapp, email into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = '23514';
  end if;

  v_channel_value := case when p_channel = 'whatsapp' then v_client.whatsapp else v_client.email end;
  if v_channel_value is null or btrim(v_channel_value) = '' then
    raise exception 'O cliente não tem este canal de contato cadastrado.' using errcode = '23514';
  end if;

  -- Revoga qualquer link pendente/verificado anterior deste cliente —
  -- só um token ativo por vez (ver client_completion_tokens_single_active_idx).
  update public.client_completion_tokens
    set status = 'revoked', revoked_at = now()
    where client_id = p_client_id and status in ('pending', 'verified');

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.client_completion_tokens (
    client_id, channel, channel_value, token_sha256, expires_at, created_by
  ) values (
    p_client_id, p_channel, btrim(v_channel_value),
    encode(digest(v_token, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  );

  return v_token;
end;
$$;

revoke all on function public.generate_client_completion_token(uuid, text) from public, anon;
grant execute on function public.generate_client_completion_token(uuid, text) to authenticated;

comment on function public.generate_client_completion_token(uuid, text) is
  'Chamada pela equipe (is_active_staff()) em IR Controle. Gera e retorna o token em claro UMA VEZ; o banco só guarda o hash. Revoga qualquer link anterior ainda ativo do mesmo cliente.';

-- Reserva de OTP (mesmo rate limit já aprovado para assinatura comercial)
-- — chamada pela camada de serviço antes de disparar o código real via
-- Supabase Auth (não implementado neste lote).
create or replace function public.reserve_client_completion_otp(
  p_token_sha256 text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente serviço.' using errcode = '42501';
  end if;
  if p_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido.' using errcode = '23514';
  end if;

  select id, status, expires_at, last_otp_requested_at, otp_requests_count, otp_window_started_at
    into v_row
    from public.client_completion_tokens
    where token_sha256 = p_token_sha256
    for update;
  if not found or v_row.status not in ('pending', 'verified') or v_row.expires_at <= now() then
    raise exception 'Link indisponível.' using errcode = '23514';
  end if;
  if v_row.last_otp_requested_at > now() - interval '60 seconds' then
    raise exception 'Aguarde um minuto antes de solicitar novo código.' using errcode = '23514';
  end if;

  v_count := case
    when v_row.otp_window_started_at is null or v_row.otp_window_started_at <= now() - interval '24 hours'
    then 0 else v_row.otp_requests_count
  end;
  if v_count >= 8 then
    raise exception 'Limite diário de códigos atingido para este link.' using errcode = '23514';
  end if;

  update public.client_completion_tokens
    set last_otp_requested_at = now(),
        otp_window_started_at = case when v_count = 0 then now() else v_row.otp_window_started_at end,
        otp_requests_count = v_count + 1
    where id = v_row.id;
end;
$$;

revoke all on function public.reserve_client_completion_otp(text) from public, anon, authenticated;
grant execute on function public.reserve_client_completion_otp(text) to service_role;

-- Marca posse de canal verificada — chamada pela camada de serviço
-- depois que o Supabase Auth confirmar o código OTP para o MESMO
-- e-mail/telefone gravado em channel_value (comparação feita pela
-- camada de serviço antes de chamar esta função, igual ao padrão de
-- finalize_commercial_signature conferir vínculo antes de persistir).
create or replace function public.verify_client_completion_channel(
  p_token_sha256 text,
  p_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente serviço.' using errcode = '42501';
  end if;
  select id, status, expires_at into v_row
    from public.client_completion_tokens
    where token_sha256 = p_token_sha256
    for update;
  if not found or v_row.status <> 'pending' or v_row.expires_at <= now() then
    raise exception 'Link indisponível ou já utilizado.' using errcode = '23514';
  end if;

  update public.client_completion_tokens
    set status = 'verified', verified_user_id = p_auth_user_id, verified_at = now()
    where id = v_row.id;
end;
$$;

revoke all on function public.verify_client_completion_channel(text, uuid) from public, anon, authenticated;
grant execute on function public.verify_client_completion_channel(text, uuid) to service_role;

-- Consome o link (uso único) — aplica só os campos permitidos no
-- allow-list, nunca CPF/CNPJ/kind (identidade não muda por este
-- caminho). Exige status='verified' (posse de canal já confirmada).
create or replace function public.consume_client_completion_token(
  p_token_sha256 text,
  p_auth_user_id uuid,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_allowed_keys text[] := array[
    'phone_primary','phone_secondary','whatsapp','email',
    'address_zip','address_street','address_number','address_complement',
    'address_neighborhood','address_city','address_state'
  ];
  v_key text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente serviço.' using errcode = '42501';
  end if;
  select id, client_id, status, expires_at, verified_user_id into v_row
    from public.client_completion_tokens
    where token_sha256 = p_token_sha256
    for update;
  if not found or v_row.status <> 'verified' or v_row.expires_at <= now()
     or v_row.verified_user_id is distinct from p_auth_user_id then
    raise exception 'Link indisponível, expirado ou não verificado.' using errcode = '23514';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_updates, '{}'::jsonb))
  loop
    if not (v_key = any(v_allowed_keys)) then
      raise exception 'Campo não permitido por este link: %', v_key using errcode = '23514';
    end if;
  end loop;

  update public.clients set
    phone_primary = coalesce(p_updates->>'phone_primary', phone_primary),
    phone_secondary = coalesce(p_updates->>'phone_secondary', phone_secondary),
    whatsapp = coalesce(p_updates->>'whatsapp', whatsapp),
    email = coalesce(p_updates->>'email', email),
    address_zip = coalesce(p_updates->>'address_zip', address_zip),
    address_street = coalesce(p_updates->>'address_street', address_street),
    address_number = coalesce(p_updates->>'address_number', address_number),
    address_complement = coalesce(p_updates->>'address_complement', address_complement),
    address_neighborhood = coalesce(p_updates->>'address_neighborhood', address_neighborhood),
    address_city = coalesce(p_updates->>'address_city', address_city),
    address_state = coalesce(p_updates->>'address_state', address_state)
  where id = v_row.client_id;

  update public.client_completion_tokens
    set status = 'completed', completed_at = now()
    where id = v_row.id;
end;
$$;

revoke all on function public.consume_client_completion_token(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.consume_client_completion_token(text, uuid, jsonb) to service_role;
