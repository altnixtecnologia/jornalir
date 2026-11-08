-- Etapa 2 — Contratos (08/11/2026). PREPARADA E VERSIONADA; NÃO aplicada em
-- produção (sem autorização).
--
-- Quem PREPARA/REVISA contratos (ou gerencia contratos no Financeiro) precisa
-- do cabeçalho CONTRATADA (empresa + representante legal padrão) para montar
-- minutas, mas `company_legal_representatives` é legível só por admin/owner
-- (RLS da Etapa 1). Esta função estreita devolve SOMENTE o necessário para o
-- documento — empresa e representantes ATIVOS, sem caminhos/hash de
-- assinatura, sem metadados internos — e só a quem tem uma dessas permissões.
-- Não abre as tabelas, não altera RLS, não entrega imagem de assinatura.

create or replace function public.get_contract_contractor_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company jsonb;
  v_reps jsonb;
begin
  if not (
    public.is_active_admin_or_owner()
    or public.staff_can_module_action('publicidade', 'contratos_preparar')
    or public.staff_can_module_action('publicidade', 'contratos_revisar')
    or public.staff_can_finance_action('contratos_criar')
    or public.staff_can_finance_action('contratos_editar')
  ) then
    raise exception 'Sem permissao para consultar os dados da contratada.';
  end if;

  select jsonb_build_object(
    'legal_name', c.legal_name, 'trade_name', c.trade_name, 'cnpj', c.cnpj,
    'address_street', c.address_street, 'address_number', c.address_number,
    'address_complement', c.address_complement, 'address_district', c.address_district,
    'address_city', c.address_city, 'address_state', c.address_state, 'address_zip', c.address_zip,
    'email', c.email, 'phone', c.phone
  ) into v_company
  from public.company_profile c
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'full_name', r.full_name, 'cpf', r.cpf, 'role_title', r.role_title,
    'nationality', r.nationality, 'representation_rule', r.representation_rule,
    'powers_description', r.powers_description, 'powers_valid_from', r.powers_valid_from,
    'powers_valid_until', r.powers_valid_until, 'active', r.active, 'is_default', r.is_default
  ) order by r.is_default desc, r.full_name), '[]'::jsonb) into v_reps
  from public.company_legal_representatives r
  where r.active;

  return jsonb_build_object('company', v_company, 'representatives', v_reps);
end;
$$;

revoke all on function public.get_contract_contractor_profile() from public, anon;
grant execute on function public.get_contract_contractor_profile() to authenticated;

comment on function public.get_contract_contractor_profile() is
  'Dados da CONTRATADA para montar contratos: empresa + representantes ativos (sem imagem/hash de assinatura). Só admin/owner ou quem prepara/revisa contratos comerciais ou gerencia contratos no Financeiro. Somente leitura.';
