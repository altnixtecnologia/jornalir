-- Bloco A — Identificação inicial (02/11/2026): CPF/CNPJ passam a ser
-- obrigatórios em TODA solicitação do portal (antes só eram obrigatórios
-- quando havia assinatura no carrinho). Além disso, a função pública
-- passa a tentar localizar um cadastro existente em public.clients pelo
-- documento informado — SEM revelar ao público se o documento já está
-- cadastrado: a resposta da RPC continua sendo apenas o id da
-- solicitação (v_id), nenhuma mensagem de erro/sucesso varia conforme o
-- documento já exista ou não. O resultado do match é só para a equipe
-- (visível internamente na fila de solicitações), nunca usado como prova
-- de identidade/autenticação.
--
-- Duplicidade/legado: se o documento bater em MAIS DE UM cliente distinto
-- (cadastros legados duplicados), não resolve automaticamente — marca
-- matched_client_ambiguous e deixa matched_client_id nulo, para revisão
-- manual da equipe (mesmo princípio de resolveOrCreateClient em
-- apps/sistema/.../solicitacoes/actions.ts, que já faz essa tolerância a
-- duplicidade legada no momento da conversão).
--
-- Correção de regressão (03/11/2026): esta "create or replace" preserva
-- INTEGRALMENTE a checagem de `site_offer_settings.assine_enabled` que já
-- existe na função instalada em produção (20261022072614) — ela precisa
-- continuar sendo a PRIMEIRA validação, antes de qualquer outra, para que
-- o botão administrativo de habilitar/desabilitar o Assine não possa ser
-- contornado por chamada direta à RPC.

alter table public.site_interest_requests
  add column if not exists matched_client_id uuid references public.clients (id),
  add column if not exists matched_client_ambiguous boolean not null default false;

create index if not exists site_interest_requests_matched_client_id_idx
  on public.site_interest_requests (matched_client_id) where matched_client_id is not null;

comment on column public.site_interest_requests.matched_client_id is
  'Preenchido automaticamente pela RPC pública quando o CPF/CNPJ informado bate com EXATAMENTE um cliente já cadastrado. Uso interno da equipe (fila de solicitações) — nunca exposto ao público nem usado como prova de identidade.';
comment on column public.site_interest_requests.matched_client_ambiguous is
  'true quando o documento informado bate com MAIS DE UM cliente distinto (cadastro legado duplicado) — a equipe precisa resolver manualmente; matched_client_id fica nulo neste caso.';

create or replace function public.submit_site_interest_request_v4(
  p_request_type text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_company text default null,
  p_selections jsonb default '[]'::jsonb,
  p_estimated_total numeric default null,
  p_notes text default null,
  p_payment_preference text default 'to_define',
  p_address_zip text default null,
  p_address_street text default null,
  p_address_number text default null,
  p_address_complement text default null,
  p_address_neighborhood text default null,
  p_address_city text default null,
  p_address_state text default null,
  p_customer_kind text default null,
  p_document_number text default null,
  p_route_reference text default null,
  p_location_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_email text := nullif(btrim(coalesce(p_email,'')),'');
  v_company text := nullif(btrim(coalesce(p_company,'')),'');
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
  v_zip text := nullif(btrim(coalesce(p_address_zip,'')),'');
  v_street text := nullif(btrim(coalesce(p_address_street,'')),'');
  v_number text := nullif(btrim(coalesce(p_address_number,'')),'');
  v_complement text := nullif(btrim(coalesce(p_address_complement,'')),'');
  v_neighborhood text := nullif(btrim(coalesce(p_address_neighborhood,'')),'');
  v_city text := nullif(btrim(coalesce(p_address_city,'')),'');
  v_state text := upper(nullif(btrim(coalesce(p_address_state,'')),''));
  v_customer_kind text := nullif(btrim(coalesce(p_customer_kind,'')),'');
  v_document text := nullif(regexp_replace(coalesce(p_document_number,''), '\D', '', 'g'),'');
  v_route_reference text := nullif(btrim(coalesce(p_route_reference,'')),'');
  v_location_url text := nullif(btrim(coalesce(p_location_url,'')),'');
  v_matched_client_id uuid;
  v_matched_count int;
begin
  if not exists (
    select 1 from public.site_offer_settings where id = 1 and assine_enabled = true
  ) then
    raise exception 'As solicitações desta página estão temporariamente indisponíveis.';
  end if;

  if p_request_type not in ('subscription','advertising','mixed') then
    raise exception 'Tipo de solicitação inválido.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Nome inválido.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 40 then
    raise exception 'Telefone inválido.';
  end if;
  if v_email is not null and char_length(v_email) > 180 then
    raise exception 'E-mail inválido.';
  end if;
  if v_company is not null and char_length(v_company) > 180 then
    raise exception 'Empresa inválida.';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Observação muito longa.';
  end if;
  if v_route_reference is not null and char_length(v_route_reference) > 1000 then
    raise exception 'Ponto de referência muito longo.';
  end if;
  if v_location_url is not null and (char_length(v_location_url) > 1000 or v_location_url !~* '^https?://') then
    raise exception 'Link de localização inválido.';
  end if;
  if p_payment_preference not in ('pix','boleto','credit_card','cash','to_define') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) = 0 or jsonb_array_length(p_selections) > 12 then
    raise exception 'Seleções inválidas.';
  end if;
  if p_estimated_total is not null and (p_estimated_total < 0 or p_estimated_total > 1000000) then
    raise exception 'Valor estimado inválido.';
  end if;

  -- Bloco A (02/11/2026): identificação agora é sempre obrigatória, não
  -- só quando há assinatura no carrinho — mesma validação de documento
  -- pra todo tipo de solicitação.
  if v_customer_kind not in ('individual','company') then
    raise exception 'Informe se é pessoa física ou empresa.';
  end if;
  if v_customer_kind = 'individual' and (v_document is null or char_length(v_document) <> 11) then
    raise exception 'Informe um CPF válido.';
  end if;
  if v_customer_kind = 'company' and (v_document is null or char_length(v_document) <> 14) then
    raise exception 'Informe um CNPJ válido.';
  end if;
  if p_request_type in ('subscription','mixed') then
    if v_zip is null or v_street is null or v_number is null
       or v_neighborhood is null or v_city is null or v_state is null then
      raise exception 'Informe o endereço completo para análise da rota de entrega.';
    end if;
  end if;

  -- Identificação silenciosa de cadastro existente pelo documento — NUNCA
  -- por nome/telefone isolados (ver nota da migration). Nenhum ramo abaixo
  -- muda a resposta da função nem lança exceção: o resultado é só
  -- bookkeeping interno, invisível para quem está preenchendo o formulário.
  if v_customer_kind = 'individual' then
    select count(*), (array_agg(id))[1] into v_matched_count, v_matched_client_id
      from public.clients where kind = 'individual' and cpf = v_document;
  else
    select count(*), (array_agg(id))[1] into v_matched_count, v_matched_client_id
      from public.clients where kind = 'company' and cnpj = v_document;
  end if;
  if v_matched_count <> 1 then
    v_matched_client_id := null;
  end if;

  insert into public.site_interest_requests (
    request_type, name, phone, email, city, company,
    selections, estimated_total, notes, payment_preference,
    address_zip, address_street, address_number, address_complement,
    address_neighborhood, address_city, address_state,
    customer_kind, document_number, route_reference, location_url,
    matched_client_id, matched_client_ambiguous
  ) values (
    p_request_type, v_name, v_phone, v_email, v_city, v_company,
    p_selections, p_estimated_total, v_notes, p_payment_preference,
    v_zip, v_street, v_number, v_complement,
    v_neighborhood, v_city, v_state,
    v_customer_kind, v_document, v_route_reference, v_location_url,
    v_matched_client_id, v_matched_count > 1
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_site_interest_request_v4(
  text,text,text,text,text,jsonb,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public;

grant execute on function public.submit_site_interest_request_v4(
  text,text,text,text,text,jsonb,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text
) to anon, authenticated;

comment on function public.submit_site_interest_request_v4(
  text,text,text,text,text,jsonb,numeric,text,text,text,text,text,text,text,text,text,text,text,text,text
) is
  'Entrada pública controlada de solicitações. V4+Bloco A (02/11/2026): CPF/CNPJ sempre obrigatórios (antes só com assinatura) e identificação silenciosa de cliente já cadastrado pelo documento (matched_client_id/matched_client_ambiguous), nunca exposta na resposta. Continua recusando com exceção quando site_offer_settings.assine_enabled = false (controle de 18/10/2026, preservado em 03/11/2026).';
