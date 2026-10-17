-- RENOMEADA em 17/10/2026 (de 20261014020555 para 20261029100060):
-- o UPDATE abaixo lê converted_client_id/converted_subscription_id/
-- converted_receivable_id, colunas criadas por
-- 20261029100050_site_interest_conversion_links.sql (também renomeada
-- nesta auditoria) — precisa continuar rodando DEPOIS dela. Nunca
-- aplicada a nenhum banco real; só o nome do arquivo mudou, conteúdo
-- idêntico.
alter table public.site_interest_requests
  add column if not exists route_reference text,
  add column if not exists location_url text,
  add column if not exists attended_at timestamptz,
  add column if not exists attended_by uuid references public.profiles(id);

alter table public.site_interest_requests
  drop constraint if exists site_interest_requests_route_reference_length,
  add constraint site_interest_requests_route_reference_length
    check (route_reference is null or char_length(route_reference) <= 1000),
  drop constraint if exists site_interest_requests_location_url_length,
  add constraint site_interest_requests_location_url_length
    check (location_url is null or char_length(location_url) <= 1000),
  drop constraint if exists site_interest_requests_location_url_format,
  add constraint site_interest_requests_location_url_format
    check (location_url is null or location_url ~* '^https?://');

create index if not exists site_interest_requests_attended_created_idx
  on public.site_interest_requests (attended_at, created_at desc);

comment on column public.site_interest_requests.route_reference is
  'Ponto de referência/instruções de rota, especialmente para interior e área rural.';
comment on column public.site_interest_requests.location_url is
  'Link opcional da localização exata, normalmente Google Maps.';
comment on column public.site_interest_requests.attended_at is
  'Momento em que a solicitação foi considerada atendida pela equipe, independente de conversão comercial.';
comment on column public.site_interest_requests.attended_by is
  'Usuário que marcou a solicitação como atendida.';

-- Recupera vínculos antigos de conversões que já guardavam a origem nas notas.
update public.site_interest_requests r
set converted_subscription_id = coalesce(
      r.converted_subscription_id,
      (
        select s.id
        from public.subscriptions s
        where s.notes ilike '%' || '[site-interest:' || r.id::text || ']' || '%'
        order by s.created_at asc
        limit 1
      )
    ),
    converted_receivable_id = coalesce(
      r.converted_receivable_id,
      (
        select rec.id
        from public.receivables rec
        where rec.notes ilike '%' || '[site-interest:' || r.id::text || ']' || '%'
        order by rec.created_at asc
        limit 1
      )
    )
where r.status = 'converted';

update public.site_interest_requests r
set converted_client_id = coalesce(
      r.converted_client_id,
      (
        select s.client_id
        from public.subscriptions s
        where s.id = r.converted_subscription_id
        limit 1
      )
    ),
    converted_at = coalesce(r.converted_at, r.reviewed_at, r.updated_at),
    attended_at = coalesce(r.attended_at, r.converted_at, r.reviewed_at, r.updated_at),
    attended_by = coalesce(r.attended_by, r.reviewed_by)
where r.status = 'converted';

update public.site_interest_requests r
set attended_at = coalesce(r.attended_at, r.reviewed_at, r.updated_at),
    attended_by = coalesce(r.attended_by, r.reviewed_by)
where r.status = 'discarded';

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
  'Entrada pública controlada de solicitações. V4 acrescenta ponto de referência e link opcional de localização para análise da rota.';
