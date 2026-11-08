-- Etapa 3B — proteger o posicionamento visual por versão do modelo.
-- NÃO aplicada em produção nesta etapa.
-- A revisão jurídica aprova uma versão com seus campos de assinatura
-- definidos. Após aprovação/ativação, não é permitido alterá-los.

create or replace function public.guard_contract_signature_field_layout_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
begin
  v_template_id := case when tg_op = 'DELETE' then old.template_id else new.template_id end;

  if tg_op = 'UPDATE' and new.template_id is distinct from old.template_id then
    raise exception 'O layout não pode mudar de versão do modelo.';
  end if;

  if not exists (
    select 1 from public.contract_templates t
    where t.id = v_template_id
      and t.document_mode = 'fixed_pdf'
      and not t.active
      and t.legal_approved_at is null
  ) then
    raise exception 'Posicionamento permitido apenas em modelos PDF sem aprovação jurídica. Crie uma nova versão.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger contract_signature_field_layout_version_guard
  before insert or update or delete on public.contract_signature_field_layouts
  for each row execute function public.guard_contract_signature_field_layout_version();

revoke all on function public.guard_contract_signature_field_layout_version() from public, anon, authenticated;

comment on function public.guard_contract_signature_field_layout_version() is
  'Bloqueia alteração de campos de assinatura/rubricas em modelos PDF já aprovados, ativos ou não PDF. Layout é por versão e permanece congelado após aprovação.';
