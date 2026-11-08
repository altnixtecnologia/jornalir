-- Etapa 1 — Contratos/Assinador (08/11/2026). PREPARADA E VERSIONADA; NÃO
-- aplicada em produção nesta etapa (sem autorização).
--
-- Dados da CONTRATADA (Jornal IR) e poderes de assinatura:
--  * company_profile: dados cadastrais da empresa (singleton) — separado de
--    nfse_issuer_configs (fiscal/certificado, adminOnly, módulo adiado).
--  * company_legal_representatives: representante(s) legal(is) com
--    identificação, regra de representação e poderes. O PNG de assinatura é
--    só a representação GRÁFICA (assinar de verdade exige confirmação
--    explícita na Etapa 3); fica em bucket PRIVADO.
--  * staff_signature_images: PNG de assinatura do próprio funcionário
--    (Meu perfil), visível só a quem tem `publicidade.contratos_assinar`.
--  * bucket privado `signature-images` (PNG, 512 KiB). SEM policy em
--    storage.objects de propósito: nenhum papel `authenticated`/`anon` lê ou
--    grava direto; só o servidor (service role), depois de checar a
--    permissão em Server Action, e entrega por URL assinada de curta duração.
--    O bucket `contract-signatures` (JPEG) NÃO é alterado.
--  * auditoria atômica por trigger (audit_events), sem gravar PII.

-- ---------------------------------------------------------------- empresa
create table public.company_profile (
  singleton boolean primary key default true check (singleton),
  legal_name text not null check (char_length(btrim(legal_name)) between 3 and 200),
  trade_name text check (trade_name is null or char_length(trade_name) <= 200),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  state_registration text check (state_registration is null or char_length(state_registration) <= 40),
  municipal_registration text check (municipal_registration is null or char_length(municipal_registration) <= 40),
  address_street text not null check (char_length(btrim(address_street)) between 3 and 200),
  address_number text check (address_number is null or char_length(address_number) <= 20),
  address_complement text check (address_complement is null or char_length(address_complement) <= 100),
  address_district text check (address_district is null or char_length(address_district) <= 100),
  address_city text not null check (char_length(btrim(address_city)) between 2 and 100),
  address_state text not null check (address_state ~ '^[A-Z]{2}$'),
  address_zip text check (address_zip is null or address_zip ~ '^[0-9]{8}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 30),
  website text check (website is null or char_length(website) <= 200),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_profile is
  'Dados cadastrais da CONTRATADA (Jornal IR) para contratos. Singleton. Separado de nfse_issuer_configs (fiscal). Alimenta as variáveis contratada.* na Etapa 2 — nunca presumir CNPJ/endereço.';

create trigger company_profile_set_updated_at
  before update on public.company_profile
  for each row execute function public.set_updated_at();

alter table public.company_profile enable row level security;
revoke all on public.company_profile from anon, authenticated;
grant select, insert, update on public.company_profile to authenticated;

create policy company_profile_select on public.company_profile
  for select to authenticated
  using (
    public.is_active_admin_or_owner()
    or public.staff_can_module_action('publicidade', 'contratos_preparar')
    or public.staff_can_module_action('publicidade', 'contratos_revisar')
  );
create policy company_profile_insert on public.company_profile
  for insert to authenticated
  with check (public.is_active_admin_or_owner());
create policy company_profile_update on public.company_profile
  for update to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- ---------------------------------------------------- representantes legais
create table public.company_legal_representatives (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 200),
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  role_title text not null check (char_length(btrim(role_title)) between 2 and 120),
  nationality text check (nationality is null or char_length(nationality) <= 60),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 30),
  -- individual: assina sozinho; joint: depende de outro(s) representante(s).
  representation_rule text not null default 'individual'
    check (representation_rule in ('individual', 'joint')),
  powers_description text not null check (char_length(btrim(powers_description)) between 10 and 1000),
  powers_evidence_note text check (powers_evidence_note is null or char_length(powers_evidence_note) <= 500),
  powers_valid_from date,
  powers_valid_until date,
  active boolean not null default true,
  is_default boolean not null default false,
  signature_path text,
  signature_sha256 text check (signature_sha256 is null or signature_sha256 ~ '^[0-9a-f]{64}$'),
  signature_bytes integer check (signature_bytes is null or signature_bytes between 1 and 524288),
  signature_updated_at timestamptz,
  signature_updated_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint company_rep_validity check (powers_valid_until is null or powers_valid_from is null or powers_valid_until >= powers_valid_from),
  constraint company_rep_signature_complete check (
    (signature_path is null and signature_sha256 is null and signature_bytes is null)
    or (signature_path is not null and signature_sha256 is not null and signature_bytes is not null)
  ),
  constraint company_rep_default_requires_active check (not is_default or active)
);

-- No máximo UM representante padrão ativo (o usado por padrão nos contratos institucionais).
create unique index company_legal_representatives_one_default
  on public.company_legal_representatives (is_default) where is_default and active;

comment on table public.company_legal_representatives is
  'Representante(s) legal(is) da CONTRATADA. Sem exclusão (só desativar). O PNG é representação gráfica — a assinatura exige confirmação explícita do representante (Etapa 3); nunca aplicar silenciosamente.';
comment on column public.company_legal_representatives.signature_path is
  'Caminho no bucket privado signature-images (representatives/<id>/<sha256>.png) — versionado por hash, nunca sobrescrito. Acesso só pelo servidor, por URL assinada.';

create trigger company_legal_representatives_set_updated_at
  before update on public.company_legal_representatives
  for each row execute function public.set_updated_at();

alter table public.company_legal_representatives enable row level security;
revoke all on public.company_legal_representatives from anon, authenticated;
grant select, insert, update on public.company_legal_representatives to authenticated;

create policy company_representatives_select on public.company_legal_representatives
  for select to authenticated
  using (public.is_active_admin_or_owner());
create policy company_representatives_insert on public.company_legal_representatives
  for insert to authenticated
  with check (public.is_active_admin_or_owner());
create policy company_representatives_update on public.company_legal_representatives
  for update to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- ------------------------------------------- assinatura PNG do funcionário
create table public.staff_signature_images (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes between 1 and 524288),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_signature_images is
  'PNG de assinatura do PRÓPRIO funcionário (Meu perfil) — só representação gráfica. Visível apenas ao dono e enquanto ele tiver publicidade.contratos_assinar. Escrita só pelo servidor (service role) após checar a permissão; sem policy de insert/update/delete para usuários.';

create trigger staff_signature_images_set_updated_at
  before update on public.staff_signature_images
  for each row execute function public.set_updated_at();

alter table public.staff_signature_images enable row level security;
revoke all on public.staff_signature_images from anon, authenticated;
grant select on public.staff_signature_images to authenticated;

create policy staff_signature_images_select_own on public.staff_signature_images
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    and public.staff_can_module_action('publicidade', 'contratos_assinar')
  );

-- ----------------------------------------------------------------- bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-images', 'signature-images', false, 524288, array['image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 524288,
  allowed_mime_types = array['image/png'];

-- ------------------------------------------------------------- auditoria
-- Registra criação/alteração/remoção SEM gravar dados pessoais (só nomes das
-- colunas alteradas e, para imagens, hash/tamanho). Atômico com a alteração.
create or replace function public.audit_contract_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_changed text[];
  v_meta jsonb;
begin
  if tg_table_name = 'company_profile' then
    v_entity_type := 'company_profile';
    v_entity_id := '00000000-0000-0000-0000-000000000001'::uuid;
  elsif tg_table_name = 'company_legal_representatives' then
    v_entity_type := 'company_legal_representative';
    v_entity_id := (v_row->>'id')::uuid;
  else
    v_entity_type := 'staff_signature';
    v_entity_id := (v_row->>'profile_id')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'updated_by', 'created_at', 'signature_updated_at', 'signature_updated_by')
      and n.value is distinct from v_old->n.key;
    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return new;
    end if;
  end if;

  v_action := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
  v_meta := jsonb_build_object('table', tg_table_name);

  if v_changed is not null then
    v_meta := v_meta || jsonb_build_object('changed_columns', to_jsonb(v_changed));
  end if;

  if tg_table_name = 'company_legal_representatives' then
    if tg_op = 'UPDATE' and (v_new->>'signature_sha256') is distinct from (v_old->>'signature_sha256') then
      v_action := case when v_new->>'signature_sha256' is null then 'signature_removed' else 'signature_replaced' end;
      v_meta := v_meta || jsonb_build_object('sha256', v_new->>'signature_sha256', 'previous_sha256', v_old->>'signature_sha256');
    elsif tg_op = 'UPDATE' and (v_new->>'active') is distinct from (v_old->>'active') then
      v_action := case when (v_new->>'active')::boolean then 'activate' else 'deactivate' end;
    elsif tg_op = 'INSERT' and v_new->>'signature_sha256' is not null then
      v_meta := v_meta || jsonb_build_object('sha256', v_new->>'signature_sha256');
    end if;
    v_meta := v_meta || jsonb_build_object('powers_changed', coalesce(v_changed && array['powers_description','powers_valid_from','powers_valid_until','representation_rule','role_title'], false));
  elsif tg_table_name = 'staff_signature_images' then
    v_action := case tg_op when 'INSERT' then 'upload' when 'UPDATE' then 'replace' else 'remove' end;
    v_meta := v_meta || jsonb_build_object(
      'sha256', v_row->>'sha256', 'size_bytes', (v_row->>'size_bytes')::int,
      'previous_sha256', case when tg_op = 'UPDATE' then v_old->>'sha256' else null end
    );
  end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), v_entity_type, v_entity_id, v_action, v_meta);

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_contract_settings_change() from public, anon, authenticated;

create trigger company_profile_audit
  after insert or update on public.company_profile
  for each row execute function public.audit_contract_settings_change();
create trigger company_legal_representatives_audit
  after insert or update on public.company_legal_representatives
  for each row execute function public.audit_contract_settings_change();
create trigger staff_signature_images_audit
  after insert or update or delete on public.staff_signature_images
  for each row execute function public.audit_contract_settings_change();
