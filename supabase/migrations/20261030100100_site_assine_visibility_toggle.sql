-- Controle de ativação do "Assine" no site público — pedido explícito do
-- usuário em 18/10/2026. NÃO aplicada ainda (local apenas, regra de trabalho
-- vigente: preparar/testar agora, aplicar só com autorização separada).
--
-- Reaproveita `site_offer_settings` (registro único já usado para os preços
-- da página /assine) em vez de criar uma tabela nova — alteração mínima,
-- pedido explícito do usuário ("preferir reaproveitar a configuração
-- existente do site, com alteração mínima e segura").
--
-- Estado inicial FALSE (desativado) — nunca liga sozinho. A política de
-- UPDATE desta tabela continua ampla (staff, já existente desde
-- 20261012201321_site_offer_settings.sql, cobre todas as colunas de preço);
-- a restrição "só administrador" para ESTA coluna específica vive na
-- aplicação (Server Action que checa profiles.role = owner/admin antes de
-- gravar), mesmo princípio já usado para birthday_message_templates — RLS
-- do Postgres não faz checagem granular por coluna sem grants separados, o
-- que seria desproporcional para uma única coluna boolean numa tabela cujas
-- outras colunas já são staff-editable de propósito.
alter table public.site_offer_settings
  add column if not exists assine_enabled boolean not null default false;

comment on column public.site_offer_settings.assine_enabled is
  'Controla se a página pública /assine (que também reúne Anuncie) fica visível no cabeçalho/menus e acessível diretamente, e se aceita novas solicitações via submit_site_interest_request_v4. false = oculta e bloqueada (estado inicial, seguro — nunca liga sozinho por falha de leitura). Alterado só por admin/owner, nunca por operator (checagem na aplicação); cadastro/exibição de patrocinadores e demais funcionalidades comerciais são independentes e não são afetados por esta coluna.';

-- Reforça o bloqueio no próprio banco (defesa em profundidade) — mesmo que
-- a página pública seja contornada de alguma forma, a função que recebe a
-- submissão real também recusa quando desativado. Única chamadora desta
-- função no projeto é AssineConfigurator.tsx (página /assine); nenhuma outra
-- funcionalidade comercial usa esta RPC, então o bloqueio aqui não afeta
-- publicidade/patrocinadores/NFS-e/financeiro, que usam tabelas e funções
-- totalmente separadas.
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

  if p_request_type in ('subscription','mixed') then
    if v_customer_kind not in ('individual','company') then
      raise exception 'Informe se a assinatura é para pessoa física ou empresa.';
    end if;
    if v_customer_kind = 'individual' and (v_document is null or char_length(v_document) <> 11) then
      raise exception 'Informe um CPF válido.';
    end if;
    if v_customer_kind = 'company' and (v_document is null or char_length(v_document) <> 14) then
      raise exception 'Informe um CNPJ válido.';
    end if;
    if v_zip is null or v_street is null or v_number is null
       or v_neighborhood is null or v_city is null or v_state is null then
      raise exception 'Informe o endereço completo para análise da rota de entrega.';
    end if;
  elsif v_customer_kind is not null then
    if v_customer_kind not in ('individual','company') then
      raise exception 'Tipo de cliente inválido.';
    end if;
    if v_customer_kind = 'individual' and v_document is not null and char_length(v_document) <> 11 then
      raise exception 'CPF inválido.';
    end if;
    if v_customer_kind = 'company' and v_document is not null and char_length(v_document) <> 14 then
      raise exception 'CNPJ inválido.';
    end if;
  end if;

  insert into public.site_interest_requests (
    request_type, name, phone, email, city, company,
    selections, estimated_total, notes, payment_preference,
    address_zip, address_street, address_number, address_complement,
    address_neighborhood, address_city, address_state,
    customer_kind, document_number, route_reference, location_url
  ) values (
    p_request_type, v_name, v_phone, v_email, v_city, v_company,
    p_selections, p_estimated_total, v_notes, p_payment_preference,
    v_zip, v_street, v_number, v_complement,
    v_neighborhood, v_city, v_state,
    v_customer_kind, v_document, v_route_reference, v_location_url
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
  'Entrada pública controlada de solicitações da página /assine. V4 acrescenta ponto de referência e link opcional de localização para análise da rota. Recusa com exceção quando site_offer_settings.assine_enabled = false (18/10/2026) — a página /assine, única chamadora, fica bloqueada nesse estado.';
