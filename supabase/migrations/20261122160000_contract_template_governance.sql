-- Etapa 1 — Contratos/Assinador (08/11/2026). PREPARADA E VERSIONADA; NÃO
-- aplicada em produção nesta etapa (sem autorização). Incremental sobre
-- contract_templates (20261029101000 + políticas posteriores) — reaproveita a
-- tabela e o versionamento (group_id/version), sem criar tabela paralela.
--
-- Governança por VERSÃO do modelo:
--  * modality (comercial/institucional) e specific_for (licitação, prefeitura,
--    Câmara, outra condição) — modelos específicos sem alterar código.
--  * document_mode: 'text' (texto com {{chaves}}) ou 'fixed_pdf' (documento
--    fixo anexo, SEM mesclar variáveis — conferência manual; limite
--    explícito na tela). PDF em bucket privado próprio.
--  * test_enabled ("habilitada para TESTE") é separado de active ("ativa para
--    PRODUÇÃO"). Minuta de teste = sem efeito contratual.
--  * Produção só com aprovação jurídica registrada por admin/owner
--    (aprovador, data, nota, evidência e hash do conteúdo da versão).
--    Imposto pelo BANCO (trigger + RPCs), não só pela tela.
--  * Toda mudança de estado gera audit_events (atômico, na própria função).
--
-- Também corrige o defeito latente: set_contract_template_active era
-- SECURITY INVOKER e a tabela não tem policy de UPDATE — o UPDATE afetava 0
-- linhas e ativar/desativar pela tela falhava. Agora é a ÚNICA porta para
-- alternar `active`, com as regras acima.
-- As 6 minutas seed permanecem active=false; nenhuma é ativada aqui.

alter table public.contract_templates
  add column if not exists modality text
    check (modality is null or modality in ('commercial', 'institutional')),
  add column if not exists specific_for text
    check (specific_for is null or char_length(btrim(specific_for)) between 3 and 200),
  add column if not exists test_enabled boolean not null default false,
  add column if not exists legal_approved_at timestamptz,
  add column if not exists legal_approved_by uuid references public.profiles (id),
  add column if not exists legal_approval_note text
    check (legal_approval_note is null or char_length(btrim(legal_approval_note)) >= 10),
  add column if not exists legal_approval_evidence text
    check (legal_approval_evidence is null or char_length(btrim(legal_approval_evidence)) >= 3),
  add column if not exists legal_approval_content_sha256 text
    check (legal_approval_content_sha256 is null or legal_approval_content_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists document_mode text not null default 'text'
    check (document_mode in ('text', 'fixed_pdf')),
  add column if not exists attachment_path text,
  add column if not exists attachment_sha256 text
    check (attachment_sha256 is null or attachment_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists attachment_bytes integer
    check (attachment_bytes is null or attachment_bytes between 1 and 10485760),
  add column if not exists attachment_note text
    check (attachment_note is null or char_length(attachment_note) <= 500);

-- Um modelo novo NUNCA nasce ativo em produção.
alter table public.contract_templates alter column active set default false;

alter table public.contract_templates
  add constraint contract_templates_document_mode_attachment check (
    (document_mode = 'text' and attachment_path is null and attachment_sha256 is null and attachment_bytes is null)
    or (document_mode = 'fixed_pdf' and attachment_path is not null and attachment_sha256 is not null and attachment_bytes is not null)
  ),
  add constraint contract_templates_legal_approval_complete check (
    (legal_approved_at is null and legal_approved_by is null and legal_approval_note is null
      and legal_approval_evidence is null and legal_approval_content_sha256 is null)
    or (legal_approved_at is not null and legal_approved_by is not null and legal_approval_note is not null
      and legal_approval_evidence is not null and legal_approval_content_sha256 is not null)
  ),
  add constraint contract_templates_production_requires_legal_approval check (
    not active or legal_approved_at is not null
  );

-- Backfill conservador: só o que é inequívoco (categoria commercial_*).
update public.contract_templates
set modality = 'commercial'
where modality is null and lower(coalesce(category, '')) like 'commercial\_%' escape '\';

comment on column public.contract_templates.active is
  'ATIVA PARA PRODUÇÃO. Só vira true por set_contract_template_active (admin/owner) e só com aprovação jurídica registrada (constraint contract_templates_production_requires_legal_approval). Independente de test_enabled.';
comment on column public.contract_templates.test_enabled is
  'Habilitada para homologação: minuta "MINUTA DE TESTE — SEM EFEITO CONTRATUAL", sem cobrança, ativação de serviço, publicação ou assinatura de obrigação real. NÃO equivale a produção.';
comment on column public.contract_templates.legal_approval_content_sha256 is
  'sha256 do conteúdo da versão no momento da aprovação — identifica exatamente o texto aprovado (o conteúdo é imutável por trigger).';
comment on column public.contract_templates.document_mode is
  'text = conteúdo com {{chaves}} mesclado; fixed_pdf = documento fixo anexo (bucket privado contract-template-files), SEM mesclar variáveis — conferência manual obrigatória.';

-- Bucket privado dos documentos fixos (PDF). Sem policy em storage.objects:
-- só o servidor (service role) grava/lê, entrega por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-template-files', 'contract-template-files', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- Linhas novas nunca entram em produção/teste/aprovadas por INSERT direto.
create or replace function public.contract_templates_force_safe_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.active := false;
  new.test_enabled := false;
  new.legal_approved_at := null;
  new.legal_approved_by := null;
  new.legal_approval_note := null;
  new.legal_approval_evidence := null;
  new.legal_approval_content_sha256 := null;
  return new;
end;
$$;

create trigger contract_templates_force_safe_insert
  before insert on public.contract_templates
  for each row execute function public.contract_templates_force_safe_insert();

-- Conteúdo da versão é imutável (inclusive para service role): só mudam
-- active, test_enabled e os campos de aprovação, e só por RPC.
create or replace function public.contract_templates_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'active' - 'test_enabled' - 'legal_approved_at' - 'legal_approved_by'
      - 'legal_approval_note' - 'legal_approval_evidence' - 'legal_approval_content_sha256')
     is distinct from
     (to_jsonb(old) - 'active' - 'test_enabled' - 'legal_approved_at' - 'legal_approved_by'
      - 'legal_approval_note' - 'legal_approval_evidence' - 'legal_approval_content_sha256') then
    raise exception 'Uma versão de modelo de contrato é imutável: crie uma nova versão para alterar o conteúdo.';
  end if;
  return new;
end;
$$;

create trigger contract_templates_guard_update
  before update on public.contract_templates
  for each row execute function public.contract_templates_guard_update();

-- Auditoria de criação de modelo/versão (sem PII; hash identifica o texto).
create or replace function public.contract_templates_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(), 'contract_template', new.id,
    case when new.version = 1 then 'create' else 'new_version' end,
    jsonb_build_object(
      'group_id', new.group_id, 'version', new.version, 'title', new.title,
      'category', new.category, 'modality', new.modality, 'specific_for', new.specific_for,
      'document_mode', new.document_mode,
      'content_sha256', encode(sha256(convert_to(new.content, 'UTF8')), 'hex'),
      'attachment_sha256', new.attachment_sha256
    )
  );
  return new;
end;
$$;

revoke all on function public.contract_templates_audit_insert() from public, anon, authenticated;

create trigger contract_templates_audit_insert
  after insert on public.contract_templates
  for each row execute function public.contract_templates_audit_insert();

-- ------------------------------------------------------------------ RPCs

create or replace function public.set_contract_template_test_mode(p_template_id uuid, p_enabled boolean)
returns public.contract_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contract_templates%rowtype;
begin
  if not (public.is_active_admin_or_owner() or public.staff_can_finance_action('contratos_editar')) then
    raise exception 'Sem permissao para alterar o modo de teste de modelos de contrato.';
  end if;
  select * into v_row from public.contract_templates where id = p_template_id for update;
  if not found then raise exception 'Modelo de contrato nao encontrado.'; end if;
  if v_row.test_enabled = p_enabled then return v_row; end if;

  update public.contract_templates set test_enabled = p_enabled where id = p_template_id returning * into v_row;
  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'contract_template', p_template_id,
    case when p_enabled then 'test_enabled' else 'test_disabled' end,
    jsonb_build_object('group_id', v_row.group_id, 'version', v_row.version, 'title', v_row.title));
  return v_row;
end;
$$;

create or replace function public.record_contract_template_legal_approval(
  p_template_id uuid, p_note text, p_evidence text
)
returns public.contract_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contract_templates%rowtype;
  v_latest integer;
  v_hash text;
begin
  if not public.is_active_admin_or_owner() then
    raise exception 'Somente administrador ou proprietário registra aprovação jurídica.';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'Informe a nota da revisão jurídica (mínimo 10 caracteres).';
  end if;
  if char_length(btrim(coalesce(p_evidence, ''))) < 3 then
    raise exception 'Informe a evidência da revisão (ex.: parecer, e-mail, identificação do advogado).';
  end if;
  select * into v_row from public.contract_templates where id = p_template_id for update;
  if not found then raise exception 'Modelo de contrato nao encontrado.'; end if;
  if v_row.legal_approved_at is not null then
    raise exception 'Esta versão já tem aprovação jurídica registrada. Revogue antes de registrar outra.';
  end if;
  select max(version) into v_latest from public.contract_templates where group_id = v_row.group_id;
  if v_row.version <> v_latest then
    raise exception 'Só a versão mais recente do modelo pode receber aprovação jurídica.';
  end if;

  v_hash := encode(sha256(convert_to(v_row.content, 'UTF8')), 'hex');
  update public.contract_templates
  set legal_approved_at = now(),
      legal_approved_by = auth.uid(),
      legal_approval_note = btrim(p_note),
      legal_approval_evidence = btrim(p_evidence),
      legal_approval_content_sha256 = v_hash
  where id = p_template_id
  returning * into v_row;

  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'contract_template', p_template_id, 'legal_approval_recorded',
    jsonb_build_object('group_id', v_row.group_id, 'version', v_row.version, 'title', v_row.title,
      'content_sha256', v_hash, 'attachment_sha256', v_row.attachment_sha256,
      'evidence', btrim(p_evidence)));
  return v_row;
end;
$$;

create or replace function public.revoke_contract_template_legal_approval(p_template_id uuid, p_reason text)
returns public.contract_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contract_templates%rowtype;
  v_was_active boolean;
  v_prev_by uuid;
  v_prev_at timestamptz;
begin
  if not public.is_active_admin_or_owner() then
    raise exception 'Somente administrador ou proprietário revoga aprovação jurídica.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Informe o motivo da revogação (mínimo 10 caracteres).';
  end if;
  select * into v_row from public.contract_templates where id = p_template_id for update;
  if not found then raise exception 'Modelo de contrato nao encontrado.'; end if;
  if v_row.legal_approved_at is null then
    raise exception 'Esta versão não tem aprovação jurídica registrada.';
  end if;
  v_was_active := v_row.active;
  v_prev_by := v_row.legal_approved_by;
  v_prev_at := v_row.legal_approved_at;

  -- Sem aprovação não há produção: desativa na mesma transação.
  update public.contract_templates
  set active = false,
      legal_approved_at = null, legal_approved_by = null, legal_approval_note = null,
      legal_approval_evidence = null, legal_approval_content_sha256 = null
  where id = p_template_id
  returning * into v_row;

  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'contract_template', p_template_id, 'legal_approval_revoked',
    jsonb_build_object('group_id', v_row.group_id, 'version', v_row.version, 'title', v_row.title,
      'reason', btrim(p_reason), 'previous_approved_by', v_prev_by, 'previous_approved_at', v_prev_at,
      'deactivated_production', v_was_active));
  return v_row;
end;
$$;

-- Única porta para alternar `active` (produção). Mesma assinatura da função
-- anterior (create or replace), agora SECURITY DEFINER com as regras.
create or replace function public.set_contract_template_active(p_template_id uuid, p_active boolean)
returns public.contract_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contract_templates%rowtype;
  v_latest integer;
  v_other record;
begin
  select * into v_row from public.contract_templates where id = p_template_id for update;
  if not found then raise exception 'Modelo de contrato nao encontrado.'; end if;
  if v_row.active = p_active then return v_row; end if;

  if p_active then
    if not public.is_active_admin_or_owner() then
      raise exception 'Somente administrador ou proprietário ativa um modelo para produção.';
    end if;
    if v_row.legal_approved_at is null then
      raise exception 'Ativação para produção exige aprovação jurídica registrada para esta versão.';
    end if;
    select max(version) into v_latest from public.contract_templates where group_id = v_row.group_id;
    if v_row.version <> v_latest then
      raise exception 'Só a versão mais recente do modelo pode ser ativada para produção.';
    end if;

    -- Uma versão ativa por modelo: desativa as demais do mesmo grupo.
    for v_other in
      select id, version from public.contract_templates
      where group_id = v_row.group_id and id <> p_template_id and active
    loop
      update public.contract_templates set active = false where id = v_other.id;
      insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
      values (auth.uid(), 'contract_template', v_other.id, 'production_deactivated',
        jsonb_build_object('group_id', v_row.group_id, 'version', v_other.version,
          'reason', 'substituída pela ativação da versão ' || v_row.version));
    end loop;
  else
    if not (public.is_active_admin_or_owner() or public.staff_can_finance_action('contratos_editar')) then
      raise exception 'Sem permissao para desativar modelos de contrato.';
    end if;
  end if;

  update public.contract_templates set active = p_active where id = p_template_id returning * into v_row;
  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), 'contract_template', p_template_id,
    case when p_active then 'production_activated' else 'production_deactivated' end,
    jsonb_build_object('group_id', v_row.group_id, 'version', v_row.version, 'title', v_row.title,
      'approved_by', v_row.legal_approved_by, 'approved_at', v_row.legal_approved_at,
      'content_sha256', v_row.legal_approval_content_sha256));
  return v_row;
end;
$$;

revoke all on function public.set_contract_template_test_mode(uuid, boolean) from public, anon;
grant execute on function public.set_contract_template_test_mode(uuid, boolean) to authenticated;
revoke all on function public.record_contract_template_legal_approval(uuid, text, text) from public, anon;
grant execute on function public.record_contract_template_legal_approval(uuid, text, text) to authenticated;
revoke all on function public.revoke_contract_template_legal_approval(uuid, text) from public, anon;
grant execute on function public.revoke_contract_template_legal_approval(uuid, text) to authenticated;
revoke all on function public.set_contract_template_active(uuid, boolean) from public, anon;
grant execute on function public.set_contract_template_active(uuid, boolean) to authenticated;

comment on function public.set_contract_template_active(uuid, boolean) is
  'Única porta para ativar/desativar um modelo em PRODUÇÃO. Ativar: admin/owner + aprovação jurídica da versão + versão mais recente; desativa as demais versões do grupo. Audita.';
