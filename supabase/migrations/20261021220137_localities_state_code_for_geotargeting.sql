-- Jornal IR | Abrangencias geograficas para segmentacao de avisos.
-- PREPARADO, NAO APLICAR SEM VALIDACAO/CONFIRMACAO.
-- Estado/UF pertence à abrangencia: nao inferir por nomes de cidades.
-- Preserva todos os IDs e as vinculações das matérias publicadas.
--
-- As tres opções amplas ja existentes sao:
-- Estado: Santa Catarina (SC); Estado: Rio Grande do Sul (RS); Pais: Brasil.
-- "Geral" permanece por compatibilidade com materias legadas.

alter table public.localities
  add column if not exists state_code text;

-- Atualiza apenas registros SEM UF, sem mudar slugs, IDs, outras localidades
-- cadastradas ou abrangencia das matérias.
update public.localities
set state_code = case
  when slug in (
    'santa-catarina','passo-de-torres','praia-grande',
    'santa-rosa-do-sul','sao-joao-do-sul'
  ) then 'SC'
  when slug in ('rio-grande-do-sul','mampituba','morrinhos-do-sul','torres') then 'RS'
  else null end
where state_code is null
  and slug in (
    'santa-catarina','passo-de-torres','praia-grande',
    'santa-rosa-do-sul','sao-joao-do-sul',
    'rio-grande-do-sul','mampituba','morrinhos-do-sul','torres'
  );

-- Nao permitir registros antigos de outras cidades sem UF passar despercebidos.
-- Cadastrar a UF dos restantes antes de VALIDATE se houver.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.localities'::regclass
      and conname = 'localities_state_code_by_scope_check'
  ) then
    alter table public.localities
      add constraint localities_state_code_by_scope_check check (
        (scope in ('city','state') and state_code in (
          'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
        ))
        or (scope in ('country','region','general') and state_code is null)
      ) not valid;
  end if;
end $do$;

create index if not exists localities_scope_state_code_idx
  on public.localities (scope, state_code, active);

-- Um unico cadastro para cada estado: evita SC/RS duplicados.
create unique index if not exists localities_one_state_per_uf_idx
  on public.localities (state_code)
  where scope = 'state';

comment on column public.localities.state_code is
  'UF da cidade ou estado (SC, RS etc.). Nula para Região/País/Geral. '
  'Usada pelo backend para direcionar push aos leitores interessados.';

-- Depois de conferir a UF de todas as cidades/estados existentes:
-- ALTER TABLE public.localities VALIDATE CONSTRAINT localities_state_code_by_scope_check;
