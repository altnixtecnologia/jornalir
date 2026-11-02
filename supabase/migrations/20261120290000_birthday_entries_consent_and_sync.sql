-- Bloco B — Cadastro complementar (02/11/2026).
--
-- 1) CONSENTIMENTO EDITORIAL — public.birthday_entries.publish_in_print
-- hoje nasce com default true (20261025100100), o que presume
-- autorização de publicação. O requisito aprovado é o oposto: "não
-- presumir autorização de publicação, exigir preferência/consentimento
-- apropriado, especialmente para menores". Acrescenta consent_status e
-- troca o default de publish_in_print para false; linhas já existentes
-- (nenhuma em produção, migration ainda não aplicada) não são afetadas
-- por ALTER COLUMN ... SET DEFAULT.
alter table public.birthday_entries
  add column if not exists consent_status text not null default 'pending',
  add column if not exists consent_recorded_by uuid references public.profiles (id),
  add column if not exists consent_recorded_at timestamptz,
  add column if not exists is_minor boolean,
  add column if not exists guardian_name text;

alter table public.birthday_entries
  drop constraint if exists birthday_entries_consent_status_valid,
  add constraint birthday_entries_consent_status_valid
    check (consent_status in ('pending', 'granted', 'denied')),
  drop constraint if exists birthday_entries_guardian_required_for_minor,
  add constraint birthday_entries_guardian_required_for_minor
    check (is_minor is not true or guardian_name is not null),
  -- Nunca presume autorização: só pode ficar marcado para publicação no
  -- jornal impresso se o consentimento tiver sido registrado como
  -- concedido.
  drop constraint if exists birthday_entries_publish_requires_consent,
  add constraint birthday_entries_publish_requires_consent
    check (publish_in_print = false or consent_status = 'granted');

alter table public.birthday_entries alter column publish_in_print set default false;

comment on column public.birthday_entries.consent_status is
  'pending (padrão) | granted | denied — nunca presumido. publish_in_print só pode ser true quando granted (ver birthday_entries_publish_requires_consent).';
comment on column public.birthday_entries.is_minor is
  'Marcação manual pela equipe quando o aniversariante é menor de idade — exige guardian_name preenchido (ver birthday_entries_guardian_required_for_minor).';
comment on column public.birthday_entries.guardian_name is
  'Nome do responsável que deu (ou negou) o consentimento, obrigatório quando is_minor = true.';

-- 2) SINCRONIZAÇÃO DO ANIVERSÁRIO DO TITULAR — "Manter aniversário do
-- titular sincronizado com o cadastro principal, sem misturar CPF/CNPJ
-- com a base editorial de aniversariantes". Em vez de duplicar essa
-- lógica em cada tela que edita public.clients, um trigger mantém a
-- linha birthday_entries (origin = 'cadastro', source_client_id =
-- client.id) espelhada a partir de clients.birth_date (PF) ou
-- clients.founding_date (PJ, já tratado como "aniversário de fundação"
-- desde 20261029101100). Não cria a linha automaticamente (ver nota
-- abaixo) — só sincroniza quando ela já existir, para não produzir
-- aniversariantes "fantasma" sem que a equipe tenha decidido incluir o
-- titular na base editorial.
create or replace function public.sync_birthday_entry_from_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  v_date := case
    when new.kind = 'individual' then new.birth_date
    when new.kind = 'company' then new.founding_date
    else null
  end;
  if v_date is null then
    return new;
  end if;
  update public.birthday_entries
    set birth_month = extract(month from v_date)::smallint,
        birth_day = extract(day from v_date)::smallint,
        birth_year = extract(year from v_date)::smallint
    where origin = 'cadastro' and source_client_id = new.id
      and (birth_month is distinct from extract(month from v_date)::smallint
        or birth_day is distinct from extract(day from v_date)::smallint
        or birth_year is distinct from extract(year from v_date)::smallint);
  return new;
end;
$$;

comment on function public.sync_birthday_entry_from_client() is
  'Mantém a linha birthday_entries (origin=cadastro) de um titular espelhada a partir de clients.birth_date (PF) ou clients.founding_date (PJ). Só atualiza — nunca cria a linha automaticamente, pra não incluir alguém na base editorial sem decisão explícita da equipe.';

create trigger clients_sync_birthday_entry
  after update of birth_date, founding_date on public.clients
  for each row
  execute function public.sync_birthday_entry_from_client();

-- 3) CONFIRMAÇÃO DISCRETA DE "SEM FAMILIARES" — "Se nenhum familiar for
-- incluído, ao avançar apresentar uma confirmação discreta, uma única
-- vez". Guardar esse "já perguntei e a equipe confirmou" em clients
-- evita repetir o aviso a cada vez que a tela de cadastro é reaberta.
alter table public.clients
  add column if not exists family_members_confirmed_empty boolean not null default false;

comment on column public.clients.family_members_confirmed_empty is
  'true depois que a equipe confirmou explicitamente (uma vez) que este titular não tem familiares a cadastrar. Evita repetir o aviso de confirmação a cada reabertura da tela de cadastro complementar.';
