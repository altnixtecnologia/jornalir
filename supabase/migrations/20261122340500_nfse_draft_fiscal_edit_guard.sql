-- NFS-e: impedir edicao concorrente de rascunhos apos o inicio da
-- transmissao, inclusive se o operador usar diretamente a Data API.
-- Este arquivo NAO foi aplicado ao banco remoto (requer backup e aceite).
--
-- O trigger executa dentro da MESMA transacao que o UPDATE do rascunho.
-- Claim de transmissao faz SELECT ... FOR UPDATE na MESMA linha:
--   * edicao antes do claim => o transmissor recarrega o snapshot apos o lock
--   * claim antes da edicao => edicao falha sem alterar dados fiscais
-- Com isso, checagens previas na Server Action deixam de ser a unica defesa.

create or replace function public.guard_nfse_draft_fiscal_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_attempt_status text;
begin
  if old.status is distinct from 'draft' then
    raise exception 'Rascunho fiscal fora do estado editavel'
      using errcode = '55000';
  end if;

  -- Enquanto claim esta ativo, nao alterar valores nem tomador.
  if old.transmission_locked_at is not null then
    raise exception 'Edicao bloqueada: transmissao da NFS-e em andamento ou pendente de verificacao'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.nfse_issued_notes where draft_id = old.id) then
    raise exception 'Edicao bloqueada: ja existe NFS-e autorizada para este rascunho'
      using errcode = '55000';
  end if;

  select status into v_last_attempt_status
  from public.nfse_transmission_attempts
  where draft_id = old.id
  order by created_at desc, id desc
  limit 1;

  if v_last_attempt_status in ('pending', 'uncertain') then
    raise exception 'Edicao bloqueada: DPS pendente ou incerta. Conciliar antes de editar'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

-- UPDATE OF: nao interfere nas RPCs de claim/release, que alteram
-- somente transmission_locked_at. Intercepta campos fiscais mesmo
-- quando uma UPDATE SQL direta nao passa pela Server Action.
drop trigger if exists nfse_draft_fiscal_edit_guard on public.nfse_drafts;
create trigger nfse_draft_fiscal_edit_guard
before update of
  client_id, tomador_kind, tomador_name, tomador_cpf, tomador_cnpj,
  tomador_municipal_registration, tomador_state_registration,
  tomador_zip, tomador_street, tomador_number, tomador_complement,
  tomador_neighborhood, tomador_city, tomador_state,
  tomador_ibge_code, tomador_email, tomador_phone,
  service_profile_id, c_trib_nac, c_trib_mun, c_nbs,
  issqn_taxation, fiscal_special_tax_regime,
  location_municipality, location_ibge_code,
  fiscal_c_atv_sn, fiscal_cst_ibs_cbs, fiscal_c_class_trib,
  fiscal_c_ind_op, fiscal_issuer_simples_nacional_option,
  fiscal_issuer_ibs_cbs_simples_nacional_regime,
  fiscal_issuer_special_tax_regime_code,
  competency_date, service_value, service_description, notes
on public.nfse_drafts
for each row execute function public.guard_nfse_draft_fiscal_edit();

-- Funcao de trigger nao deve ser invocada como RPC de API pelo usuario.
revoke all on function public.guard_nfse_draft_fiscal_edit()
  from public, anon, authenticated;

comment on function public.guard_nfse_draft_fiscal_edit()
  is 'Bloqueia edicao fiscal durante claim de transmissao, apos autorizacao ou enquanto a ultima DPS esta pendente/incerta. Protecao transacional e independente da UI.';
