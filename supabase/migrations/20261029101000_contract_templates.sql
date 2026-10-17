-- Item 5, Lote 3: modelos de contrato e geracao automatica de PDF.
-- NAO aplicada ainda.
--
-- VERSIONAMENTO: cada EDICAO de conteudo cria uma linha NOVA (nunca
-- sobrescreve uma versao ja existente) — "group_id" agrupa todas as
-- versoes do "mesmo" modelo (a primeira versao tem group_id = id
-- dela mesma). "Duplicar" cria um group_id NOVO (modelo
-- independente, nao uma versao do original). A versao "atual" de um
-- grupo e sempre a de maior numero; so ela pode ser ativada/
-- desativada e usada para gerar contratos novos — versoes antigas
-- continuam existindo, intocadas, e contratos ja gerados a partir
-- delas continuam identificando exatamente qual versao usaram
-- (ver contract_documents.template_id/template_version abaixo) —
-- nunca sao apagadas nem reescritas.
--
-- CONTEUDO: texto puro com placeholders "{{chave}}" (nunca HTML/script
-- executavel armazenado ou interpretado) — a substituicao e troca
-- literal de texto, nunca avaliacao de expressao.
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  version integer not null default 1 check (version >= 1),

  title text not null check (length(btrim(title)) between 3 and 180),
  description text,
  -- Categoria é só referência organizacional (ex.: "publicidade",
  -- "prestacao_servicos", "assinaturas", "institucional") — texto
  -- livre, nunca um enum fechado (o usuario pode criar categorias
  -- novas sem migration).
  category text,

  content text not null check (length(content) > 0),
  -- Lista de campos variaveis configuraveis (alem dos preenchidos
  -- automaticamente do cliente/contrato) — [{ key, label, required }].
  variables jsonb not null default '[]'::jsonb,

  active boolean not null default true,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint contract_templates_group_version_unique unique (group_id, version)
);

create index if not exists idx_contract_templates_group
  on public.contract_templates(group_id, version desc);
create index if not exists idx_contract_templates_active
  on public.contract_templates(active) where active;

alter table public.contract_templates enable row level security;

-- Mesmo padrao de permissao de conteudo administrativo financeiro
-- (is_active_staff(); o modulo "financeiro" especifico e checado na
-- aplicacao via staff_can_see_module, mesmo principio de
-- institutional_contracts). Nenhuma policy nova inventada.
create policy contract_templates_select_staff
  on public.contract_templates for select
  to authenticated
  using (public.is_active_staff());

create policy contract_templates_insert_staff
  on public.contract_templates for insert
  to authenticated
  with check (public.is_active_staff());

-- Sem policy de update/delete: uma versao, uma vez criada, e
-- imutavel (mesmo principio de contract_documents/nfse_issued_notes)
-- — "editar" e "ativar/desativar" sempre inserem ou leem, nunca
-- alteram uma linha existente. A UNICA excecao e o proprio campo
-- "active", que e alternado por uma RPC estreita abaixo (nunca por
-- update direto da aplicacao) para manter essa regra garantida pelo
-- banco, nao so por convencao da aplicacao.
create or replace function public.set_contract_template_active(
  p_template_id uuid, p_active boolean
)
returns public.contract_templates
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row public.contract_templates%rowtype;
begin
  if not public.is_active_staff() then
    raise exception 'Sem permissao para alterar modelos de contrato.';
  end if;
  update public.contract_templates set active = p_active
    where id = p_template_id
    returning * into v_row;
  if not found then raise exception 'Modelo de contrato nao encontrado.'; end if;
  return v_row;
end;
$$;

revoke all on function public.set_contract_template_active(uuid, boolean) from public, anon;
grant execute on function public.set_contract_template_active(uuid, boolean) to authenticated;

comment on table public.contract_templates is
  'Modelos de contrato (Item 5, Lote 3) — versionado por group_id/version, nunca editado em lugar; contrato gerado identifica a versao exata usada (ver contract_documents.template_id/template_version).';
comment on column public.contract_templates.content is
  'Texto puro com placeholders {{chave}} — substituicao sempre literal (troca de texto), nunca HTML/script armazenado ou avaliado.';

-- Liga o documento gerado (contract_documents) a exata versao do
-- modelo usada para gera-lo — nullable: documentos anexados
-- manualmente (upload direto) continuam sem nenhum vinculo, fluxo
-- 100% preservado.
alter table public.contract_documents
  add column if not exists template_id uuid references public.contract_templates(id) on delete set null,
  add column if not exists template_version integer;

comment on column public.contract_documents.template_id is
  'Preenchido só quando este documento foi gerado automaticamente a partir de um modelo — nunca para upload manual. Aponta pra versão EXATA usada (nunca pro "modelo" em geral), mesmo que o modelo seja editado depois.';
