-- Cadastro mestre (public.clients) — campos fiscais aprovados que ainda não
-- existiam, preparados AGORA para quando o Supabase remoto voltar (regra de
-- trabalho vigente: desenvolver agora, aplicar remotamente depois). Esta
-- migration só ACRESCENTA colunas — nenhuma coluna/constraint/índice
-- existente de 20261011100000_clients.sql é alterada ou removida.
--
-- RENOMEADA de 20261025100000 para 20261025100001 na reconciliação de
-- migrations (ver relatório da tarefa): o timestamp 20261025100000 já
-- pertence, no histórico remoto, a uma migration diferente e já aplicada
-- (nfse_initial_integration_security) — pura coincidência de timestamp,
-- nenhuma relação de conteúdo entre as duas. Nunca reutilizar
-- 20261025100000 para nada local a partir de agora.
--
-- NÃO aplicada ainda. NÃO executar `supabase db push` nem qualquer SQL
-- remoto a partir desta migration — ver relatório da tarefa.

alter table public.clients
  add column fiscal_email text,
  add column municipal_registration text,
  add column address_ibge_code text,
  add column icms_status text;

comment on column public.clients.fiscal_email is
  'E-mail opcional preferencial para comunicação fiscal/NFS-e. `email` continua obrigatório como e-mail principal. Quando fiscal_email está vazio, a APLICAÇÃO usa email como fallback — este banco nunca duplica o valor de email aqui automaticamente.';
comment on column public.clients.municipal_registration is
  'Inscrição municipal do cadastro — relevante principalmente para PJ (kind = company). Opcional: nem todo cadastro possui ou precisa informar.';
comment on column public.clients.address_ibge_code is
  'Código IBGE do município do endereço (7 dígitos) — usado para pré-popular município/UF em futuras emissões de NFS-e. Texto livre validado por formato, nunca FK para uma tabela de municípios que não existe neste projeto.';
comment on column public.clients.icms_status is
  'Situação do cadastro perante o ICMS: contribuinte / isento / nao_contribuinte. Opcional — o foco atual do sistema é NFS-e (ISSQN), nem todo cadastro precisa dessa informação. Nunca booleano: são três estados distintos, não dois.';

alter table public.clients
  add constraint clients_address_ibge_code_digits
    check (address_ibge_code is null or address_ibge_code ~ '^[0-9]{7}$'),
  add constraint clients_icms_status_values
    check (icms_status is null or icms_status in ('contribuinte', 'isento', 'nao_contribuinte'));

-- save_client (criada em 20261011100000_clients.sql) precisa escrever os
-- 4 campos novos — sem isto, a RPC continuaria ignorando silenciosamente
-- qualquer valor enviado pela aplicação para eles. CREATE OR REPLACE com a
-- MESMA assinatura: redefine o corpo, não recria a função nem exige
-- alterar a migration original. Mesmo princípio de identidade-por-tipo já
-- aplicado às colunas existentes: todo campo é escrito explicitamente a
-- cada chamada (nunca "coalesce com o valor atual").
create or replace function public.save_client(
  p_id uuid,
  p_client jsonb,
  p_roles text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_roles text[] := coalesce(p_roles, '{}'::text[]);
begin
  if auth.role() = 'authenticated' and not public.is_active_staff() then
    raise exception 'save_client: apenas staff ativo pode criar/editar clientes';
  end if;

  if p_id is null then
    insert into public.clients (
      kind, status,
      full_name, cpf, birth_date,
      company_name, trade_name, cnpj, state_registration, responsible_name, responsible_cpf,
      phone_primary, phone_secondary, whatsapp, email, fiscal_email,
      municipal_registration, address_ibge_code, icms_status,
      address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state,
      notes
    )
    values (
      p_client->>'kind', coalesce(p_client->>'status', 'active'),
      p_client->>'full_name', p_client->>'cpf', nullif(p_client->>'birth_date', '')::date,
      p_client->>'company_name', p_client->>'trade_name', p_client->>'cnpj', p_client->>'state_registration', p_client->>'responsible_name', p_client->>'responsible_cpf',
      p_client->>'phone_primary', p_client->>'phone_secondary', p_client->>'whatsapp', p_client->>'email', p_client->>'fiscal_email',
      p_client->>'municipal_registration', p_client->>'address_ibge_code', p_client->>'icms_status',
      p_client->>'address_zip', p_client->>'address_street', p_client->>'address_number', p_client->>'address_complement', p_client->>'address_neighborhood', p_client->>'address_city', p_client->>'address_state',
      p_client->>'notes'
    )
    returning id into v_id;
  else
    update public.clients set
      kind = p_client->>'kind',
      status = coalesce(p_client->>'status', 'active'),
      full_name = p_client->>'full_name',
      cpf = p_client->>'cpf',
      birth_date = nullif(p_client->>'birth_date', '')::date,
      company_name = p_client->>'company_name',
      trade_name = p_client->>'trade_name',
      cnpj = p_client->>'cnpj',
      state_registration = p_client->>'state_registration',
      responsible_name = p_client->>'responsible_name',
      responsible_cpf = p_client->>'responsible_cpf',
      phone_primary = p_client->>'phone_primary',
      phone_secondary = p_client->>'phone_secondary',
      whatsapp = p_client->>'whatsapp',
      email = p_client->>'email',
      fiscal_email = p_client->>'fiscal_email',
      municipal_registration = p_client->>'municipal_registration',
      address_ibge_code = p_client->>'address_ibge_code',
      icms_status = p_client->>'icms_status',
      address_zip = p_client->>'address_zip',
      address_street = p_client->>'address_street',
      address_number = p_client->>'address_number',
      address_complement = p_client->>'address_complement',
      address_neighborhood = p_client->>'address_neighborhood',
      address_city = p_client->>'address_city',
      address_state = p_client->>'address_state',
      notes = p_client->>'notes'
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'save_client: cliente não encontrado (id=%)', p_id;
    end if;
  end if;

  delete from public.client_roles where client_id = v_id;
  if array_length(v_roles, 1) > 0 then
    insert into public.client_roles (client_id, role)
    select v_id, r from unnest(v_roles) as r;
  end if;

  return v_id;
end;
$$;

comment on function public.save_client(uuid, jsonb, text[]) is
  'Cria (p_id nulo) ou atualiza (p_id preenchido) um cliente e substitui o conjunto de papéis inteiro, tudo na mesma transação. Redefinida em 20261025100001_clients_fiscal_fields.sql para escrever também fiscal_email/municipal_registration/address_ibge_code/icms_status — mesma assinatura e mesmo princípio de escrita explícita de toda coluna de identidade da versão original (20261011100000_clients.sql).';

-- ==================================================================
-- VALIDAÇÕES DE OBRIGATORIEDADE (PF: nome/CPF/WhatsApp/e-mail/papel;
-- PJ: razão social/CNPJ/WhatsApp/e-mail/papel) — DELIBERADAMENTE NÃO
-- implementadas nesta migration.
--
-- Motivo: o Supabase remoto está bloqueado (402) e não há como auditar
-- se os registros reais já existentes satisfazem esses requisitos.
-- Adicionar `not null`/`check` cegamente aqui poderia quebrar dados
-- reais no momento em que esta migration finalmente for aplicada.
--
-- Plano para quando o Supabase voltar:
--   1. rodar auditoria real (SELECT contando violações de cada regra
--      antes de qualquer ALTER);
--   2. se não houver violações (ou após corrigi-las manualmente),
--      criar uma SEGUNDA migration, nova e aditiva (timestamp
--      posterior a todas as existentes no momento), só com os
--      `not null`/`check` de obrigatoriedade;
--   3. nunca reaproveitar esta migration para isso — ela já terá sido
--      aplicada.
--
-- cpf/cnpj já têm índice único parcial (clients_cpf_unique/
-- clients_cnpj_unique, criados em 20261011100000_clients.sql) — não
-- recriar.
-- ==================================================================
