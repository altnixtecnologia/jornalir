# Banco IR Core — `site-system-ir` (Fase 17)

Fonte central futura para `apps/sistema` e `apps/site`. Nunca o banco do
Altnix Informativo nem da Altnix Platform (ver `docs/PLANO-MESTRE-JORNALIR.md`,
Partes 3–4).

**Status nesta fase**: schema, RLS e seeds existem como migrations
versionadas em `supabase/migrations/`. Nenhuma tela do `apps/sistema` ou do
`apps/site` foi migrada para consumir este banco ainda — os dois apps
continuam 100% sobre os providers mock (`@ir/mocks`, IndexedDB). A migração
de fato será feita provider por provider, em uma fase futura.

---

## 1. Mapa de tabelas

```text
auth.users (gerenciado pelo Supabase Auth)
  └─ profiles                 (1:1 — id = auth.users.id)

editorial_sections            (editorias — independente)
localities                    (localidades — independente; parent_id opcional para cidade→região)
newspaper_editions             (edições do jornal impresso)

articles                       (matéria)
  ├─ section_id      → editorial_sections.id      (obrigatório)
  ├─ locality_id      → localities.id              (obrigatório)
  ├─ newspaper_edition_id → newspaper_editions.id  (opcional)
  ├─ created_by / updated_by → profiles.id         (opcional)
  ├─ article_placements       (1:N — destaque/capa, temporário)
  └─ article_media            (1:N — capa + galeria)
        └─ media_id → media_assets.id

media_assets                   (biblioteca de mídia)

pdf_import_batches             (um lote = uma extração de PDF)
  └─ newspaper_edition_id → newspaper_editions.id
pdf_import_candidates          (um candidato = uma matéria em potencial)
  ├─ batch_id         → pdf_import_batches.id
  ├─ newspaper_edition_id → newspaper_editions.id
  ├─ suggested_section_id → editorial_sections.id  (opcional)
  ├─ suggested_locality_id → localities.id         (opcional)
  ├─ created_article_id → articles.id              (preenchido só quando status=converted)
  └─ merged_into_id   → pdf_import_candidates.id   (preenchido só quando status=merged)

audit_events                   (log imutável — sem update/delete para ninguém)
  └─ user_id → profiles.id (opcional)
```

## 2. Tabela por tabela

| Tabela | Papel | Observações |
| --- | --- | --- |
| `profiles` | Perfil complementar a `auth.users` | Criada automaticamente por trigger (`handle_new_auth_user`) ao nascer um `auth.users`; role inicial sempre `operator` (Fase 19 — antes era `editorial`). Promover a `admin`/`owner` é sempre uma ação deliberada, nunca o padrão. |
| `editorial_sections` | Editorias (assuntos) | `slug` único; `sort_order` é a ordem de exibição da redação, não o id. Sem exclusão — só `active=false`. |
| `localities` | Cidade/região/geral | `scope` ∈ {`general`,`region`,`city`}; `parent_id` opcional para cidade apontar para sua região (não usado pelos seeds). |
| `newspaper_editions` | Edição impressa | `pdf_url`/`cover_url` opcionais — alimentam futuramente "Ver esta matéria na edição digital" no portal; nunca inventados enquanto vazios (mesmo princípio já aplicado no painel desde a Fase 15). |
| `articles` | Matéria | `internal_reference` gerado automaticamente (`IR-MAT-{ano}-{sequencial}`, sequência dedicada). Sem exclusão destrutiva — nenhuma policy de `delete`, "arquivada" é o único caminho de remoção. |
| `article_placements` | Destaque/capa | Tabela própria (não uma coluna em `articles`) — o histórico de destaques de uma matéria é relevante por si só. Destaque nunca substitui a editoria. |
| `media_assets` | Biblioteca de mídia | `storage_path` preparado para o Supabase Storage (ainda nulo — upload real fora de escopo nesta fase); `public_url` é o caminho atual (URL já hospedada, mesmo comportamento do mock desde a Fase 06). Constraint garante que pelo menos um dos dois exista. |
| `article_media` | Vínculo matéria↔mídia | Índice único parcial (`role='cover'`) garante **no máximo 1 capa por matéria** no próprio banco, não só por convenção da aplicação. `caption_override`/`credit_override` sobrescrevem, só para aquele uso, o padrão de `media_assets`. |
| `pdf_import_batches` | Um lote de extração | Uma linha por upload de PDF processado para uma edição. |
| `pdf_import_candidates` | Candidato a matéria | Guarda toda a rastreabilidade da extração (`extraction_method`, avisos, `page_coverage`, `source_blocks`). Um candidato `converted` nunca pode ser atualizado de novo — reforçado por RLS (`status <> 'converted'` na policy de update), não só pela aplicação. |
| `audit_events` | Log imutável | Sem `update`/`delete` para nenhum papel, nem admin — consistente com a Parte P do Plano Mestre ("nenhum registro de auditoria poderá ser apagado pelo usuário da aplicação"). Só admin lê (`select`); qualquer staff ativo insere, só em seu próprio nome. |

## 3. Papéis e RLS

**Desde a Fase 19**, três papéis (`profiles.role`): `owner`, `admin`,
`operator` (o modelo anterior, `admin`/`editorial` da Fase 17, foi
substituído — ver migration `20260922100000_owner_admin_operator_roles.sql`).

- **owner** — no máximo 1 em todo o banco (índice único parcial
  `profiles_single_owner`). Dono do sistema: administra admins e
  operadores. **Nunca** pode ser editado, desativado, rebaixado ou apagado
  por ninguém — nem por si mesmo pelo painel — reforçado por RLS **e** por
  um trigger (`protect_owner_profile`, `BEFORE UPDATE OR DELETE`) que
  bloqueia qualquer alteração de `role`/`active`/`id` numa linha que já é
  `owner`, e por qualquer `DELETE`. Dupla camada deliberada: RLS decide
  quem pode tentar, o trigger garante que a tentativa nunca funciona,
  mesmo vindo de um caminho que já passou pela RLS.
- **admin** — acesso administrativo amplo ao conteúdo editorial; cria e
  gerencia `operator`; **nunca** promove ninguém a `admin` (só `owner`
  pode) e **nunca** toca no `owner`.
- **operator** — acesso ao fluxo editorial (substitui o antigo
  `editorial`); sem gestão de usuários.

Todos os três têm o **mesmo acesso ao conteúdo editorial** (matérias,
editorias, localidades, mídias, importação de PDF, publicação) — a
diferença entre eles está inteiramente em `profiles`/`audit_events`
(quem gerencia quem, quem lê o log). Sem permissões de financeiro/CRM
ainda porque esses módulos não existem.

Padrão de policy em toda tabela de negócio: `select`/`insert`/`update` para
`is_active_staff()` (função `SECURITY DEFINER`, evita recursão de RLS ao
consultar `profiles`; redefinida na Fase 19 para os 3 papéis novos — as
policies de `articles`/`editorial_sections`/etc. chamam essa função pelo
nome e não precisaram ser tocadas); **sem `delete`** — a remoção sempre é
reversível (`active=false`, `status='archived'`, etc.), exceto em
`article_media` (remover uma foto de uma matéria é uma operação normal e
não destrutiva; a mídia em si continua existindo na biblioteca).

`profiles`: `select` é o próprio perfil, ou qualquer perfil quando
`owner`/`admin` (tela `/sistema/usuarios`) — `operator` nunca vê perfil
alheio. `update`: `owner` altera qualquer perfil não-`owner` (promovendo/
rebaixando entre `admin`/`operator`, ativando/desativando); `admin` só
altera perfis que já são `operator`, e o resultado da alteração precisa
continuar sendo `operator` (a policy em si já impede a promoção — o
trigger do `owner` nem chega a ser necessário para bloquear isso). Sem
`delete` (item 8 da Fase 19 — só ativar/desativar).

`audit_events`: `select` agora é `owner` **ou** `admin` (antes só
`admin`); `insert` continua qualquer staff ativo, só em seu próprio nome.

Leitura pública (para `apps/site` consumir matérias publicadas) está **fora
de escopo nesta fase**, de propósito — nenhuma policy libera `anon`. Quando
essa fase chegar, a policy deverá liberar `select` só para `status =
'published'` e nunca expor rascunho/agendado/arquivado a um usuário anônimo.

## 4. Divergências conhecidas com `packages/types`/`packages/core` (mock atual)

Documentadas aqui, não corrigidas nesta fase (instrução explícita: não
migrar as telas nem remover mocks ainda).

| Campo | Mock atual (`@ir/types`) | Banco (`site-system-ir`) | Motivo |
| --- | --- | --- | --- |
| `ImportCandidateStatus` | `"pending" \| "discarded" \| "converted"` | `pending, kept, discarded, converted, merged, split` | Fase 17 pediu um modelo mais expressivo (distinguir "mantido em revisão" de "mesclado"/"dividido" como estados próprios, não só metadado). O mock atual guarda mesclagem via `mergedIntoId` sobre `discarded`, e divisão não marca estado nenhum no candidato original. Reconciliar quando a tela de importação migrar para o banco. |
| `MediaAsset.name` | campo `name` | coluna `title` | Mesmo conceito (nome curto para localizar na biblioteca, distinto de `caption`); nome de coluna escolhido pela especificação desta fase. Mapear na camada de composição ao migrar. |
| `ArticleOrigin` | `"manual" \| "pdfImport"` | `manual, pdf` | Mesmo conceito, valor mais curto no banco (`pdf` em vez de `pdfImport`). |
| IDs | `string` (mock gera IDs sequenciais tipo `article-1245`) | `uuid` (`gen_random_uuid()`) | Nenhum código atual depende do formato do ID além de igualdade — sem impacto esperado na migração. |

Nenhuma outra divergência estrutural relevante — os demais campos
(`Article`, `EditorialSection`, `Locality`, `NewspaperEdition`,
`ArticlePlacement`/`EditorialPlacement`) já mapeiam 1:1 conceitualmente
entre o mock e o banco (só `camelCase` → `snake_case`).

## 5. Como aplicar

Local (com Docker):

```bash
supabase start
supabase db reset   # aplica todas as migrations + seeds do zero
```

Contra o projeto remoto `site-system-ir` (requer `supabase login` e um
token pessoal só local, nunca commitado):

```bash
supabase link --project-ref iqnzrpdccecgalqboeyf
supabase db push
```

**Status: aplicado de verdade contra o projeto remoto (Fase 18, 21/09/2026).**
Sequência real executada, nesta ordem:

1. `supabase login` — bloqueado na primeira tentativa (ambiente sem TTY não
   consegue abrir o fluxo automático de navegador); usuário rodou o login
   no próprio terminal, fora deste ambiente.
2. `supabase link --project-ref iqnzrpdccecgalqboeyf` — confirmado
   `{"project_ref":"iqnzrpdccecgalqboeyf"}`; `supabase projects list`
   confirmou adicionalmente `name: "site-system-ir"`, `linked: true`, e os
   outros dois projetos da organização (`altnix-platform`, `FarmaTemp`)
   com `linked: false` — sem ambiguidade sobre qual projeto foi alvo.
3. `supabase db push --dry-run` — listou as 12 migrations, todas novas
   (`upToDate: false`), na ordem correta, nenhuma operação destrutiva no
   conteúdo revisado (só `CREATE`/`INSERT ... ON CONFLICT DO NOTHING`).
4. `supabase db push` — as 12 migrations aplicadas com sucesso, sem erro.

Nenhum `db reset` remoto, `drop` geral ou comando destrutivo foi usado em
momento algum.

### Validação pós-aplicação (via `supabase db query --linked`)

Consultas somente-leitura contra o catálogo do Postgres (`information_schema`,
`pg_class`, `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_trigger`) —
nenhuma exposição de dado sensível, resultado resumido:

- **11 tabelas** presentes em `public`, exatamente a lista esperada.
- **RLS habilitada** (`relrowsecurity = true`) nas 11 tabelas.
- **31 policies** — padrão confirmado: sem `delete` em nenhuma tabela de
  negócio exceto `article_media` (proposital); `pdf_import_candidates`
  tem uma única policy de `update`
  (`pdf_import_candidates_update_staff_not_converted`), confirmando a
  proteção contra reconversão também no banco.
- **9 triggers** — os 8 `set_updated_at` esperados + `on_auth_user_created`
  (`AFTER INSERT` em `auth.users`), a criação automática de `profiles`.
- **Índice único parcial `article_media_one_cover_per_article`** confirmado
  (`WHERE role = 'cover'`) — 1 capa por matéria garantida no banco.
- **34 constraints** de FK/CHECK conferidas uma a uma contra o desenho
  original (inclui `pdf_import_candidates_converted_has_article`,
  `pdf_import_candidates_merged_has_target`, `media_assets_has_source`,
  `article_placements_window_check`).
- **Seeds**: `editorial_sections` = 7 linhas, `localities` = 4 linhas.

### Limite desta validação — teste funcional/RLS end-to-end não executado

O item "teste mínimo controlado" (criar usuário de teste, confirmar profile,
criar matéria draft, vincular editoria/localidade, placement, capa+galeria,
audit event, validar RLS como usuário real) **não foi executado**: o
classificador de modo automático deste ambiente bloqueou a tentativa de
inserir uma linha de teste em `auth.users` ("Modify Shared Resources"),
por ser uma escrita direta numa tabela do sistema de autenticação de um
projeto real compartilhado — mesmo sem senha, mesmo descartável, mesmo com
plano de limpeza ao final. Nenhuma linha chegou a ser criada (confirmado por
`select count(*) ... where id = '<uuid de teste>'` → `0`); nenhum lixo de
teste ficou no banco. A validação estrutural acima (constraints, policies,
triggers, índices) prova que as REGRAS existem corretamente no schema; não
prova, por execução real, que elas se comportam como esperado sob uma
sessão autenticada de verdade. Fica como próximo passo, preferencialmente
feito pelo usuário localmente (`supabase login` + um teste manual pela
própria aplicação ou pelo SQL editor do dashboard) ou nesta sessão com uma
liberação explícita de permissão para esse tipo de escrita.

Config e `.env.local` conferem com o projeto certo (`project_id =
"site-system-ir"` em `supabase/config.toml`; `NEXT_PUBLIC_SUPABASE_URL`
aponta para `iqnzrpdccecgalqboeyf.supabase.co`) — sem risco de ter aplicado
contra Altnix Informativo/Platform.

## 6. Variáveis de ambiente

Cada app lê seu próprio `.env.local` (nunca commitado; `.gitignore` na raiz
cobre `.env.local` em qualquer profundidade). Nomes usados:

```text
NEXT_PUBLIC_SUPABASE_URL=https://iqnzrpdccecgalqboeyf.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`apps/sistema/.env.local` já está configurado com os valores reais deste
projeto. `apps/site/.env.example` está preparado (mesmos nomes) para quando
o portal também precisar. **Nunca** commitar `SUPABASE_SERVICE_ROLE_KEY` ou
um token pessoal (`sbp_...`) — essas credenciais administrativas só existem
localmente, fora do repositório, quando realmente necessárias para rodar a
CLI.

## 7. Fase 19 — owner/admin/operator + Auth real do painel

### Migration `20260922100000_owner_admin_operator_roles.sql` — status: **não aplicada ainda**

Escrita e revisada estaticamente (mesmo padrão de rigor das anteriores),
mas a sessão local da CLI expirou no meio desta fase — `supabase projects
list` e `supabase db push --dry-run` passaram a retornar `Unauthorized`
(diferente do bloqueio do classificador do ambiente visto na Fase 18; este
é um 401 real do lado do Supabase, a sessão de `supabase login` simplesmente
não está mais válida). **Ação necessária, fora deste ambiente**: rodar
`supabase login` de novo no terminal do usuário. Depois disso, a sequência
já testada e segura desde a Fase 18 continua valendo:

```bash
supabase link --project-ref iqnzrpdccecgalqboeyf
supabase db push --dry-run   # conferir: só esta migration nova, nada destrutivo
supabase db push             # aplicar de verdade
```

O que a migration faz (sem editar nenhuma migration antiga já aplicada):
migra `profiles.role` de `admin`/`editorial` para `owner`/`admin`/`operator`
(convertendo `editorial` → `operator`, sempre com `UPDATE` antes de trocar
a `CHECK constraint`); cria o índice único parcial `profiles_single_owner`
(no máximo 1 owner em todo o banco); cria a função+trigger
`protect_owner_profile` (bloqueia `UPDATE`/`DELETE` que tentem alterar
`role`/`active`/`id` de uma linha que já é `owner`); redefine
`handle_new_auth_user()` para nascer sempre `operator`; redefine
`is_active_staff()`/`is_active_admin()` e cria `is_active_owner()`/
`is_active_admin_or_owner()`; reescreve as 3 policies de `profiles` e a
policy de `select` de `audit_events` para o novo modelo de 3 papéis.

### Auth real no `apps/sistema` — código pronto, sem usuário real para testar ainda

`apps/sistema/src/lib/auth/AuthProvider.tsx` (novo) substitui inteiramente
a sessão mock (`localStorage`) da Fase 16 — `mockSession.ts` foi **removido
do repositório**. Fonte de verdade agora é o SDK do Supabase
(`client.auth.getSession()`/`onAuthStateChange()`), nunca uma flag em
`localStorage`. Fluxo: sessão válida → carrega `profiles` real do usuário
→ `active=false` desconecta (`signOut()`) e manda para `/login?erro=inativo`
→ `active=true` libera o painel com `role` real disponível via `useAuth()`.
`AuthGate.tsx`, `login/page.tsx` (agora `signInWithPassword` de verdade),
`AdminHeader.tsx`/`AdminShell.tsx` (logout real) e a nova
`/sistema/usuarios` (`UsersManager.tsx`) todos consomem esse mesmo
provider, montado uma única vez no layout raiz (`RootProviders.tsx`).

**Sem migration aplicada e sem nenhum usuário real criado, o login não tem
como funcionar de verdade ainda** — `signInWithPassword` vai sempre
retornar "credenciais inválidas" até existir pelo menos um `auth.users`
real no projeto. Isso é esperado nesta fase, não um bug.

### `/sistema/usuarios` — listagem e gestão de papel/status prontas; criação de usuário com uma limitação conhecida

Lista (`select` em `profiles`, protegido por RLS), promover/rebaixar
(`owner` apenas), ativar/desativar (`owner`+`admin`, respeitando quem cada
um pode tocar) — todas essas ações são `UPDATE`s simples que dependem só da
RLS já validada estruturalmente. O botão "Convidar" usa
`client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
— a única forma de criar uma conta nova **sem usar `service_role`** e
**sem sequestrar a sessão do admin que está convidando** (diferente de
`signUp()`, que trocaria a sessão do navegador para a do usuário novo).
**Limitação conhecida, não testada nesta sessão** (sem forma de testar
envio de e-mail neste ambiente): a API de convite nunca devolve o `id` do
usuário criado na resposta, então promover para `admin` no ato do convite
não é possível — o convite sempre nasce `operator` (via trigger), e
promover a `admin` é sempre um segundo passo manual depois que a pessoa
aparecer na lista.

### Ação manual necessária — criar o primeiro `owner`

Não inventamos nem geramos um `owner` sozinhos (item 4 da Fase 19). Dois
passos manuais, feitos pelo usuário:

1. **Dashboard do Supabase** → Authentication → Users → criar (ou convidar)
   a conta real que será o `owner` — `enable_signup = false` no
   `config.toml` bloqueia o autocadastro público, então essa primeira conta
   só nasce por essa via administrativa.
2. Depois que a conta existir (e a migration acima estiver aplicada — o
   trigger já terá criado o `profiles` correspondente como `operator`),
   promover via **SQL Editor do Dashboard** (nunca commitado, nunca com
   e-mail fixo em migration):

   ```sql
   update public.profiles
   set role = 'owner'
   where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');
   ```

   O índice único `profiles_single_owner` garante que isso só funciona uma
   vez; tentar promover uma segunda conta depois retorna erro de violação
   de unicidade.

## 8. Fase 20 — hardening: owner imutável, auth SSR, convite server-side

### Migration `20260923100000_owner_immutable_hardening.sql` — status: **não aplicada ainda**

A Fase 19 (`20260922100000_...`) foi aplicada com sucesso — confirmado
depois, por introspecção real do banco: `profiles_role_check` já aceita
`owner/admin/operator`, zero linhas `editorial` remanescentes, índice
`profiles_single_owner`, trigger `profiles_protect_owner`, os 4 helpers de
RLS e as policies novas de `profiles`/`audit_events`, todos confirmados.
Também confirmado, na mesma validação: **1 profile real já existe**,
`role='operator'`, `active=true` (criado pelo usuário, não por esta sessão
— não lemos e-mail nem qualquer outro dado além de role/active/created_at).

A Fase 20 endurece `protect_owner_profile()`: a Fase 19 só bloqueava
alterar `role`/`active`/`id` de uma linha que já é owner; a nova versão
bloqueia **qualquer** `UPDATE`/`DELETE` nessa linha, sem exceção de campo
(inclusive `name`, que antes podia ser editado). A sessão da CLI expirou
de novo no meio desta fase
(mesmo tipo de erro já visto duas vezes: `Unauthorized` até em
`supabase projects list`) — **ação necessária, fora deste ambiente**: rodar
`supabase login` mais uma vez. Depois disso:

```bash
supabase link --project-ref iqnzrpdccecgalqboeyf
supabase db push --dry-run   # confirmar: só esta migration nova
supabase db push
```

### Auth SSR real (`@supabase/ssr`) — substituindo o cliente client-only

Até a Fase 19, a sessão vivia só no `localStorage` do navegador (via
`@supabase/supabase-js` puro) — o `AuthGate` client-side "decidia" se
mostrava o painel, mas um acesso direto a `/sistema/*` ainda entregava a
página (vazia, mas entregava) antes do React barrar. A Fase 20 corrige
isso com `src/middleware.ts` (Next.js), usando `@supabase/ssr` para ler a
sessão de cookies e `auth.getUser()` (não `getSession()` — valida o token
contra o servidor de Auth a cada requisição, não só confia no cookie).
Confirmado por teste real nesta fase: `GET /sistema` sem cookie de sessão
→ `307` para `/login`, **antes de qualquer HTML da página ser gerado**;
mesmo resultado para `/sistema/usuarios`, `/sistema/editorial/materias`,
`/sistema/editorial/importar-pdf`. `AuthGate` continua existindo, mas
agora só como UX (evita flash de conteúdo durante a hidratação) — a
proteção real é o middleware.

Três clientes Supabase agora, cada um com um papel:
`lib/supabase/browser.ts` (navegador, cookies via `@supabase/ssr`),
`lib/supabase/server.ts` (Server Components/Actions, também cookies),
`lib/supabase/admin.ts` (só `service_role`, `import "server-only"` —
o build falha se um Client Component tentar importar isso). O antigo
`lib/supabaseClient.ts` (Fase 17, `localStorage`-only) foi removido —
substituído pelos três acima.

### Convite de usuário — server-side de verdade, sem `service_role` no navegador

`signInWithOtp` (Fase 19) foi removido do `UsersManager.tsx`. Convite agora
é uma Server Action (`app/sistema/usuarios/actions.ts`, `inviteUser`):
revalida a sessão de quem chama (`getUser()` no servidor, nunca confia em
nada vindo do cliente sobre "quem sou eu"), carrega o `profiles` real
dessa pessoa, e só então decide: `operator`/`admin` sem permissão →
recusado; `admin` tentando convidar `admin` → recusado (só `owner` pode);
sem `SUPABASE_SERVICE_ROLE_KEY` configurada → mensagem clara ("criação de
usuários ainda não habilitada"), painel continua funcionando normalmente.
Com a chave configurada, usa `admin.auth.admin.inviteUserByEmail()` (Admin
API, `service_role`, só em `lib/supabase/admin.ts`) — diferente de
`signInWithOtp`, essa chamada **devolve o id do usuário criado**, então
promover a `admin` (quando convidado por um `owner`) é possível de
verdade, não mais um "torça para dar certo" como na Fase 19. Novo
`app/definir-senha/page.tsx` (rota pública, fora de `/sistema`, fora do
matcher do middleware) é para onde o link do convite aponta — a pessoa
define a própria senha (`auth.updateUser({password})`) e depois entra
normalmente por `signInWithPassword`.

**Não testado nesta sessão** (sem como enviar/receber e-mail real aqui):
o fluxo completo convite → clique no link → definir senha → logout →
login com senha. Único jeito de validar de ponta a ponta é o usuário
convidar uma conta real e seguir o fluxo manualmente.

### Ação para promover o primeiro `owner` — sem adivinhar qual conta

Já existe 1 profile real (`role='operator'`, `active=true`) — não sabemos
nem tentamos descobrir qual é (não lemos e-mail). Depois que a migration
desta fase estiver aplicada:

```sql
update public.profiles
set role = 'owner'
where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');
```

Rode isso pelo **SQL Editor do Dashboard** (nunca commitado, nunca com
e-mail fixo em migration), usando o e-mail da conta que você mesmo
cadastrou. O índice único `profiles_single_owner` garante que só funciona
uma vez; e, depois de aplicada a migration desta fase, mesmo essa
promoção — por ser um `UPDATE` numa linha que ainda **não** é owner —
continua permitida (o trigger só passa a bloquear a linha depois que ela
já é owner).

## 9. Fase 22 — consolidação de destinos editoriais (mock/tipos)

Fase de UI/domínio: `packages/types`, `packages/core` e `packages/mocks`
foram ajustados. Nesta fase o banco ainda não foi tocado — a migration
correspondente foi criada e aplicada depois, na Fase 23 (seção 10 abaixo).

### O que mudou no domínio (mock)

- `EditorialPlacementType`: as 7 posições antigas (`headline`,
  `mainHighlight`, `secondaryHighlight`, `urgent`, `sectionHighlight`,
  `special`) viraram 5 (`none`, `mainCover`, `highlightStrip`,
  `latestNews`, `localSpotlight`) — cada uma correspondendo a um bloco
  real e já implementado do portal (capa/faixa/últimas notícias/região).
  As que não tinham lugar nenhum para aparecer foram descontinuadas, não
  substituídas por alias.
- `urgent` deixou de ser uma posição e virou `Article.urgent: boolean`,
  campo próprio, independente de `placement` e de `notificationMode`.
- `EditorialPlacement` ganhou `pinned?: boolean` ("Fixar na capa", só
  relevante quando `type === "mainCover"`) e `setAt?: string`
  (timestamp interno para ordenação determinística — nunca a ordem
  incidental de leitura do banco).
- `ArticleService` ganhou a lógica de rotação: `updateDraft`/`schedule`
  agora carimbam `setAt` sempre que o `type` muda, e aplicam
  `enforcePlacementLimit` depois de qualquer posição não-`none` ser
  definida — evicta automaticamente (volta para `type: "none"`, nunca
  apaga, nunca muda editoria/localidade/status) a mais antiga não-fixada
  quando o limite da posição (8/3/7/4) é ultrapassado. Fixadas nunca são
  evictadas, mas sempre ocupam uma vaga dentro do limite. Novo
  `listActivePlacement(type)`: só `status='published'`, respeitando a
  janela `startsAt`/`endsAt`, ordenado por `setAt` mais recente primeiro
  — pronto para consumo futuro (nenhuma tela usa isto ainda).
- Validado por script de negócio temporário (removido ao final, nunca
  commitado), reproduzindo os serviços reais: 21/21 asserções — editoria/
  localidade preservadas ao entrar/sair de posição; matéria evictada
  nunca apagada e continua publicada; limite de 8 na capa (a 9ª entrada
  evicta a mais antiga não-fixada); matéria fixada nunca expulsa mesmo
  com 8 novas entrando depois; nunca mais de 8 visíveis mesmo com
  fixadas; limite de 3 na faixa de destaques; limite de 7 em Últimas
  notícias; matéria agendada (ainda não publicada) não aparece na
  posição até a data chegar; limite de 4 em Nossa região; selecionar
  Nossa região não substitui a localidade original; `urgent` não altera
  posição nem editoria.

## 10. Fase 23 — migration real dos destinos editoriais (aplicada)

### Diagnóstico prévio (obrigatório antes de escrever a migration)

Leitura real do banco, antes de qualquer `ALTER`: **0 rows em `articles`,
0 rows em `article_placements`, nenhum tipo antigo em uso**. Sem dado real
para perder ou mapear — migration aplicada com segurança, sem qualquer
heurística de conversão de dado inventada.

### `20260924100000_editorial_placement_model.sql` — status: **aplicada**

- `article_placements.type`: `CHECK` trocado — só aceita `mainCover`,
  `highlightStrip`, `latestNews`, `localSpotlight` (os antigos `headline`/
  `primary`/`secondary`/`breaking`/`section`/`special` removidos do
  vocabulário; confirmado por teste real que uma tentativa de inserir
  `'headline'` é rejeitada). `none` continua sem virar linha — ausência de
  linha ativa já significa nenhuma exposição extra, mesmo desenho
  historicizado da Fase 17, preservado.
- `article_placements.pinned boolean not null default false` — nova
  coluna, mais uma constraint declarativa
  `article_placements_pinned_only_main_cover` (`not pinned or type =
  'mainCover'`) — confirmado por teste real que `pinned=true` fora de
  `mainCover` é rejeitado.
- `articles.urgent boolean not null default false` — nova coluna, sem
  relação nenhuma com `placement`, `section_id`, `locality_id` ou `status`.
- `enforce_placement_limit()` (função + trigger `AFTER INSERT OR UPDATE`
  em `article_placements`): mesma lógica de `packages/core`
  `ArticleService.enforcePlacementLimit`, agora reforçada no próprio
  banco — fixadas nunca evictadas, sempre ocupam vaga; vagas restantes vão
  para as mais recentes; excesso de não fixadas volta para `active=false`
  (nunca `DELETE`); uma 9ª fixada quando as 8 vagas já estão fixadas é
  **rejeitada com exceção clara**, nunca evictando uma fixada existente
  nem ultrapassando o limite. Concorrência: `pg_advisory_xact_lock` por
  tipo de posição serializa transações que mexem no mesmo destino ao
  mesmo tempo, liberado automaticamente no fim da transação.

### `20260924100100_editorial_placement_deterministic_tiebreak.sql` — status: **aplicada**

**Achado real durante o teste** (não um bug teórico — encontrado testando
contra o banco de verdade nesta mesma fase): a primeira versão do trigger
ordenava só por `created_at desc`. Um lote de testes inserido dentro de
uma única transação recebeu o **mesmo** `created_at` para todas as linhas
(`now()` é estável por transação no Postgres) — o `row_number() over
(order by created_at desc)` ficou sem critério de desempate, e a evicção
escolheu uma linha arbitrária em vez da mais antiga, violando a exigência
explícita de "ordenação determinística, nunca a ordem incidental do
banco". Corrigido acrescentando `id desc` como desempate secundário — não
implica "mais recente" de verdade em caso de empate real de timestamp
(`id` é `gen_random_uuid()`, não sequencial), só garante que o resultado é
sempre o mesmo, todas as vezes, que é a garantia pedida. Migration
incremental separada (não editou a de minutos antes) — mesmo princípio de
"nunca alterar migration já aplicada" já vale para migrations da própria
sessão, não só de fases anteriores.

### Validação real (contra `site-system-ir`, dados de teste sempre removidos ao final)

- **8/3/7/4 confirmados**: 8 entradas em `mainCover` → todas ativas; 9ª
  entrada (inserida em transação separada, `created_at` genuinamente
  diferente) → evicta corretamente a mais antiga (`active=false`), as
  outras 8 permanecem ativas. `highlightStrip` com 4 entradas → só 3
  ativas.
- **Fixar protegido**: 7 matérias fixadas + 1 pré-existente = 8 fixadas
  (todas as vagas de `mainCover`); uma 9ª tentativa de fixar → rejeitada
  com exceção citando o limite, nenhuma linha criada.
- **Tipos antigos rejeitados**: tentativa de `type='headline'` → rejeitada
  pela `CHECK` constraint.
- **Pinned fora de mainCover rejeitado**: tentativa de `pinned=true` com
  `type='highlightStrip'` → rejeitada pela `CHECK` constraint.
- **Integridade**: depois de todas as evicções, o artigo evictado
  continua com `status`, `section_id` e `locality_id` idênticos aos
  originais — nenhum artigo apagado, nenhuma editoria/localidade alterada.
- **RLS preservada**: 32 policies no schema antes e depois das duas
  migrations (nenhuma perdida, nenhuma tabela com RLS desabilitada); as 3
  policies de `articles` e as 3 de `article_placements` continuam
  cobrindo as colunas novas automaticamente (RLS é por linha, não por
  coluna).
- **Owner intocado**: confirmado depois de tudo — exatamente 1 `profile`
  com `role='owner'`, `active=true`.
- **Limpeza**: todos os dados de teste (prefixo `qa-fase23`/`qa-fase23b`)
  removidos ao final — `0` linhas restantes, confirmado por consulta.
- **Concorrência**: a trava (`pg_advisory_xact_lock`) foi revisada
  estruturalmente e é o padrão recomendado do Postgres para este problema;
  **não foi exercitada com duas transações genuinamente simultâneas**
  nesta sessão (as chamadas da CLI são sequenciais) — validação de
  concorrência real fica como item futuro, se algum dia for necessário
  (ex.: script com duas conexões paralelas).

## 11. Próxima fase (sugestão)

Auth real (Fase 20/21) já está concluída — owner existe, ativo, correto,
promovido uma única vez e agora imutável; login pela aplicação já foi
validado pelo usuário. Modelo de destinos editoriais já está no banco
(Fase 23). Caminhos possíveis a partir daqui: migração provider-por-
provider do conteúdo editorial (`apps/sistema` primeiro — matérias/
editorias/localidades/mídias/importação de PDF — reconciliando as
divergências da seção 4), uma tela de gestão de posições editoriais no
painel (consumindo `ArticleService.listActivePlacement`), ou só então
`apps/site` passando a ler `published` diretamente do banco com RLS
pública.
