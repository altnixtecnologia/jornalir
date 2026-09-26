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

## 12. Fase 24 — Providers reais: Editorias + Localidades

`apps/sistema` passou a ler e gravar `editorial_sections` e `localities`
direto no Supabase, mantendo a camada `UI → Service → Repository Contract
→ Supabase Provider` (nenhum componente de UI faz consulta direta ao
Supabase). Nenhuma migration nova — schema já suportava tudo.

- **Providers novos**: `apps/sistema/src/providers/supabase/
  editorialSectionRepository.supabase.ts` e `localityRepository.supabase.ts`
  implementam os contratos `EditorialSectionRepository`/`LocalityRepository`
  de `@ir/core`, mapeando `sort_order` (DB) ↔ `order` (domínio).
- **Composição**: `composition/editorial.ts` trocou os singletons
  `editorialSectionService`/`localityService`/`articleService`/
  `importCandidateService` por factories (`getEditorialSectionService(client)`,
  etc.) — necessário porque o cliente Supabase autenticado só existe dentro
  de uma requisição (`createSupabaseServerClient()` usa `cookies()` do
  Next.js). `mediaAssetService`/`newspaperEditionService` continuam
  singletons (ainda mock, Fase 25+). Todas as telas/actions que consomem
  esses serviços foram atualizadas para construir o cliente por requisição.
- **Matérias/PDF/Mídias**: telas continuam usando `articleService`/
  `importCandidateService` (agora via factory) só para ler/gravar editoria
  e localidade reais nos formulários — o `Article` em si **continua mock**
  (não migrado nesta fase).
- **Divergência conhecida (não corrigida por decisão explícita — "não
  mudar schema sem necessidade")**: `EditorialSection.description` existe
  no tipo de domínio mas não tem coluna em `editorial_sections`; o
  provider real simplesmente não persiste esse campo. `Locality` no
  domínio não expõe `order`/`parent_id`, embora a tabela tenha
  `sort_order`/`parent_id` — colunas existentes, só não usadas ainda.
- **Teste de persistência real** (contra `site-system-ir`, via
  `supabase db query --linked`, dados sempre removidos ao final): criado
  `editorial_sections`/`localities` com prefixo `qa-fase24`, editado
  (nome + `active=false`), depois apagado — `count()` confirmado igual ao
  original (7 editorias, 4 localidades) antes e depois.
- **RLS/owner intocados**: 32 policies antes e depois; owner continua
  `role=owner active=true`, nenhuma escrita feita nesse profile.
- **Middleware**: `/sistema/editorial/editorias`, `/localidades` e
  `/materias` continuam redirecionando (307) para `/login` sem sessão —
  confirmado via `curl` depois do refactor.

## 13. Fase 25 — provider real de Matérias + destinos editoriais coerentes com agendamento

`ArticleRepository` passou a ser real (Supabase) em `apps/sistema`. Mídias
continuam mock (Fase 26). `apps/site` não foi tocado.

- **Duas migrations novas** (`20260925100000_articles_real_provider.sql`,
  `20260925100100_placement_pinned_capacity_fix.sql`) — nenhuma migration
  anterior alterada.
- **Estilos persistidos**: `articles.title_style`/`subtitle_style` (jsonb)
  — o editor já os expunha; a Fase 22/23 os mantinha só em memória.
- **Divergência da Fase 24 corrigida**: `editorial_sections.description`
  ganhou coluna real — é campo editável de verdade na tela de Editorias
  (não um campo do type sem uso), a Fase 24 descartava silenciosamente por
  falta de coluna só.
- **`created_by`/`updated_by` nunca vêm do cliente**: trigger
  `set_article_actor()` sempre usa `auth.uid()` da sessão, em INSERT e
  UPDATE — mesmo que o provider mande outro valor (ele nunca manda).
- **`article_placements` — só uma linha ativa por matéria**: índice único
  parcial `article_placements_one_active_per_article (article_id) where
  active`. Testado: tentar uma segunda linha ativa para a mesma matéria
  falha com `23505` (constraint violation).
- **`enforce_placement_limit` reescrita — coerente com agendamento (item 8
  da fase)**: uma linha só disputa/expulsa vaga quando a matéria já está
  `published` **e** a janela própria (`starts_at`) já chegou. Rascunho,
  ajuste, agendada e arquivada nunca disputam — a linha existe só como a
  declaração de destino do editor (sobrevive a um refresh/reabertura), sem
  contar para o limite 8/3/7/4 até uma publicação de verdade tocar aquele
  placement de novo (o provider reafirma a linha ativa ao publicar —
  `touchActivePlacement` — para forçar o trigger a reavaliar com o status
  atualizado; sem isso o trigger nunca re-roda sozinho, porque ele só
  dispara em INSERT/UPDATE de `article_placements`, nunca por causa de um
  UPDATE em `articles`). Sem cron: "quando o horário chega" nesta fase é
  sempre a ação humana de publicar — não há transição automática
  `scheduled→published`.
- **Capacidade de fixadas corrigida (achado desta fase, não só o pedido do
  item 8)**: a função herdada da Fase 23 só evictava não-fixadas quando a
  linha nova também era não-fixada; inserir uma fixada com as 8 vagas não-
  fixadas já ocupadas não evictava ninguém, deixando o total efetivo em 9
  até a próxima escrita não-fixada. Corrigido unificando os dois caminhos
  (migration `..._pinned_capacity_fix.sql`) — o total (fixadas + não-
  fixadas) agora nunca ultrapassa o limite em nenhuma escrita.
- **`ArticleService` (packages/core) também corrigido**: `enforcePlacementLimit`
  (chamado em JS, não só o trigger do banco) agora só considera ocupantes
  `published`; `publishNow` passou a chamar `enforcePlacementLimit` (antes
  não chamava — uma matéria publicada com destino escolhido em rascunho
  nunca disputava vaga de verdade); `schedule` deixou de chamar
  `enforcePlacementLimit` (agendamento nunca deve disputar/expulsar hoje).
  `listActivePlacement` ganhou um corte de segurança por limite (fixadas
  primeiro, depois mais recentes, `.slice(0, limite)`) — mesmo que o
  `active` do banco ainda não tenha reagido a uma mudança recente, a
  leitura nunca mostra mais que o limite.
- **Slug**: gerado só na criação, a partir do título (accent-stripping +
  URL-safe), nunca regenerado numa edição (evita quebrar URL publicada).
  Unicidade por tentativa de sufixo `-2`, `-3`... contra o banco (sem
  extensão `unaccent`, que este projeto não tem instalada — normalização
  de acento é feita em JS). Testado: dois títulos idênticos → segunda
  tentativa de mesmo slug rejeitada pela constraint única (`23505`),
  confirmando que o loop de retry do provider tem o que precisa para
  funcionar.
- **Imagens**: provider real de Matérias nunca escreve em `article_media`
  nesta fase (Media Provider ainda mock, Fase 26) — `changes.media` é
  ignorado, `list`/`getById` sempre devolvem `media: []` para matéria real.
  Nenhum vínculo real é perdido porque nenhum é tocado.
- **Teste real completo** (contra `site-system-ir`, `supabase db query
  --linked`, dados removidos ao final): 8 matérias `published` preenchendo
  `mainCover`; 9ª como rascunho → não disputa, os 8 continuam intactos; 10ª
  `published` com `starts_at` amanhã → não disputa; publicar a 9ª (rascunho
  → published) e reafirmar seu placement → evicta exatamente 1 das 8
  originais, total efetivo permanece 8; inserir uma 11ª fixada com as 8
  vagas não-fixadas já ocupadas → evicta 1 não-fixada, total permanece 8;
  segunda linha ativa para a mesma matéria → rejeitada pelo índice único;
  `title_style` jsonb → grava e lê de volta idêntico; dois artigos com o
  mesmo título/slug → segunda inserção rejeitada. Tudo limpo ao final —
  `0` matérias restantes (banco também tinha `0` antes de começar).
- **RLS/owner intocados**: 32 policies antes e depois; owner continua
  `role=owner active=true`. `/sistema/editorial/materias` e `/nova`
  continuam redirecionando (307) para `/login` sem sessão.
- **Limitação aceita, documentada (não corrigida — instrução explícita de
  não usar cron)**: se uma matéria `published` tem `starts_at` no futuro e
  NADA mais toca aquele tipo de posição depois que a janela abre, o
  `active` do banco só reflete a realidade na próxima escrita daquele
  tipo — a leitura pública (`listActivePlacement`) já filtra corretamente
  por janela e nunca mostra mais que o limite, mas o bookkeeping do banco
  pode ficar "atrasado" por um tempo nesse cenário específico (raro: exige
  publicar algo hoje para aparecer só amanhã e depois nada mexer no tipo).

## 14. Fase 26 — Mídias reais (Storage) + fotos das matérias

`MediaAssetRepository` passou a ser real (Supabase + Storage) em
`apps/sistema`. `ArticleRepository` (Fase 25) passou a carregar/gravar
`article_media` de verdade — capa/galeria deixam de ser sempre `[]`.

- **Duas migrations novas** (`20260926100000_media_real_provider.sql`,
  `20260926100100_media_assets_actor_trigger.sql`) — nenhuma migration
  anterior alterada.
- **`altText`/`capturedAt` persistidos**: ganharam coluna real
  (`alt_text`, `captured_at`) — eram campos editáveis de verdade na tela
  de Mídias (Fase 16/22) que a Fase 25 corria o risco de descartar
  silenciosamente assim que o provider real existisse; corrigido junto.
- **Bucket `article-media`** (Supabase Storage): público para leitura (a
  foto precisa aparecer no futuro portal público sem sessão), upload/
  alteração só para staff autenticado via RLS de Storage — nunca
  `service_role` no navegador. Limite de 8 MB, só `image/jpeg|png|webp|avif`.
  Caminho sempre `{uuid}/{nome-sanitizado}` — nunca colide. Testado real:
  upload não-autenticado rejeitado (`403`, política de RLS), leitura
  pública alcança o objeto sem sessão (`404` correto para arquivo
  inexistente, não erro de autorização).
- **`created_by` de `media_assets`** também nunca vem do cliente — trigger
  `set_media_asset_actor()` usa `auth.uid()`, mesmo princípio de
  `set_article_actor` (Fase 25).
- **Capa/galeria (`article_media`)**: regra 0/1/2+ já existia no domínio;
  o provider real agora sincroniza fielmente com o banco. Trocar a capa
  nunca perde a imagem anterior — ela vira o primeiro item da galeria
  (nunca apagada, nunca perde o arquivo no Storage). Remover da matéria
  apaga só o vínculo `article_media`, nunca `media_assets` nem o Storage.
  Índice único parcial (`article_media_one_cover_per_article`, já existia
  desde a Fase 17) garante nunca duas capas simultâneas — o provider
  sempre demove a capa antiga antes de promover a nova, respeitando a
  ordem para nunca violar o índice mesmo sem transação explícita.
- **Sem N+1 na listagem**: `list()` carrega só a capa (uma query `.in()`
  para todos os artigos da página); `getById()` carrega capa + galeria
  completa. Nenhuma consulta por artigo individual.
- **Teste real completo** (contra `site-system-ir`, dados removidos ao
  final): matéria QA com 1 capa + 2 galeria; trocar a capa → a antiga vira
  galeria (confirmado, sem violar o índice único); remover uma foto da
  matéria → vínculo apagado, `media_assets` intacto; tentar inserir uma
  segunda linha `role=cover` para a mesma matéria → rejeitada pelo índice
  único (`23505`). Tudo limpo ao final — `0` matérias/mídias QA restantes.
- **RLS/owner intocados**: 32 policies antes e depois; owner continua
  `role=owner active=true`. Middleware confirmado bloqueando
  `/sistema/editorial/midias` e `/materias/nova` sem sessão.
- **Instagram corrigido** em `apps/site` (`siteSettings.ts`):
  `jornalinformativo.regional` (perfil errado) →
  `jornal.informativoregional` (perfil oficial, `@jornal.informativoregional`).
- **Limitação aceita (documentada, não bloqueante)**: dimensões
  (`width`/`height`) de uma foto enviada por upload não são detectadas no
  servidor nesta fase (exigiria uma biblioteca de processamento de imagem,
  ex. `sharp`, não instalada no projeto) — campo fica `undefined`, mesmo
  comportamento de uma mídia cadastrada por URL sem informar dimensões
  manualmente. Não impede nenhuma funcionalidade descrita nesta fase.

- **Preview público na Vercel (`apps/site` apenas)**: projeto `jornalir`
  já existente na conta (`Root Directory = apps/site`, criado antes desta
  sessão) reutilizado — nenhum projeto novo criado, nenhum domínio oficial
  tocado (`informativoregional.net` não está conectado a nenhum projeto
  desta conta Vercel). Deploy feito com `vercel deploy` (sem `--prod`,
  nunca aponta para produção nem domínio custom). Proteção SSO do time
  (`ssoProtection`, bloqueava o link para quem não tem login na Vercel)
  desativada para este projeto — necessário para o link ser realmente
  compartilhável, como pedido explicitamente.
- **Achado real durante a verificação do Preview (case-sensitivity)**:
  `apps/site/public/brand/Logo-escrita.png` estava no disco com "L"
  maiúsculo, mas todo o código referencia `/brand/logo-escrita.png`
  (minúsculo) — undetectável no Windows (filesystem case-insensitive),
  gerava `404` de verdade em produção Linux (Vercel). Confirmado via
  `curl` contra o Preview antes e depois; corrigido renomeando o arquivo
  (`git mv`, preserva histórico) — nenhuma outra imagem do site tinha o
  mesmo problema (conferido nome a nome, incluindo os anúncios com espaço/
  acento no nome, que já batiam exatamente).
- **Testes reais contra o Preview** (`curl`, HTTP): todas as rotas
  públicas (`/`, `/noticias`, `/esportes`, `/materias`, `/jornal-online`,
  `/anuncios`, `/sobre`, `/contato`, `/busca`, etc.) retornam `200`;
  Instagram no HTML aponta para `jornal.informativoregional` (perfil
  correto); WhatsApp aponta para o número correto; PDFs do Jornal Digital/
  Flipbook presentes e acessíveis; marcador `latest-news-active` presente
  no HTML da home (item selecionado de Últimas notícias). Verificação
  visual/interativa (mobile real, animações, virar página do flipbook)
  não pôde ser feita neste ambiente por falta de navegador — só checagem
  estrutural via HTTP.

## 15. Fase 27 — Importação de PDF real (edições + candidatos)

`NewspaperEditionRepository` (somente leitura, como já era) e
`ImportCandidateRepository` passaram a ser reais (Supabase) em
`apps/sistema`. Nenhum mock de conteúdo editorial resta no painel.

- **Migration nova** (`20260927100000_pdf_import_real_provider.sql`):
  `pdf_import_candidates` ganhou `page_width`/`page_height` — usados de
  verdade no `viewBox` do SVG de pré-visualização da página de origem
  (`ImportCandidateSourcePreview.tsx`); sem coluna, o provider real
  descartaria esse dado silenciosamente. Nenhuma migration anterior
  alterada.
- **`NewspaperEdition.reference`** (ex.: "ED-2026-038") não tem coluna
  própria — gerado no provider a partir de `edition_number` + ano de
  `publication_date`, mesmo formato dos dados mock anteriores.
  **`pageCount`** não tem coluna e não é usado por nenhuma tela real
  (o único `pageCount` usado é o de um resultado de extração de PDF, um
  conceito diferente) — fica sempre `undefined`, sem migration.
- **Um lote = uma extração** (`pdf_import_batches`): `NewImportCandidateRecord`
  não carrega metadados de lote (nome do arquivo, contagem de páginas,
  avisos gerais — esses só existem no retorno de `extractCandidatesFromPdf`,
  consumido direto pela Server Action, nunca persistido); o provider cria
  uma linha mínima de lote só como âncora da FK obrigatória de
  `pdf_import_candidates.batch_id` — `source_file_name`/`page_count`/
  `warnings` do lote ficam vazios (divergência documentada, sem uso real).
- **Sem cadastro de edições ainda**: `NewspaperEditionService` continua só
  leitura (decisão de fases anteriores, não desta). Sem uma edição real
  cadastrada, a tela de Importação de PDF não tem o que listar — gap
  pré-existente, não introduzido nem resolvido nesta fase.
- **Teste real completo** (contra `site-system-ir`, via
  `supabase db query --linked`, dados removidos ao final): criada uma
  edição QA real; criado um lote + 2 candidatos (simulando `createMany`);
  "manter" (atribuir editoria/localidade) num candidato; "descartar" no
  outro; "converter em rascunho" no primeiro (cria a matéria com
  `origin=pdf`, `status=draft`, marca o candidato `converted` com
  `created_article_id`). Limpeza respeitando a ordem de FK (candidatos →
  matéria → lote → edição) — `0` linhas restantes em todas as tabelas
  envolvidas.
- **Limitação aceita (não verificada nesta fase)**: a policy
  `pdf_import_candidates_update_staff_not_converted` (já existia desde a
  Fase 17, `USING (status <> 'converted')`) não pôde ser testada como
  sessão `authenticated` real — a conexão de teste desta sessão (CLI)
  ignora RLS. Mesma limitação estrutural das Fases 21/24 (sem credenciais
  de um usuário real neste ambiente).
- **RLS/owner intocados**: 32 policies antes e depois; owner continua
  `role=owner active=true`. Middleware confirmado bloqueando
  `/sistema/editorial/importar-pdf` sem sessão.

## 16. Fase 28 — Gestão real das edições do jornal

`NewspaperEditionRepository`/`Service` passaram de "só leitura" para
CRUD completo (create/update/setActive) — tela própria em
`/sistema/editorial/edicoes`, linkada no menu Editorial.

- **Duas migrations novas**: `20260928100000_newspaper_editions_management.sql`
  (`page_count` — quantidade de páginas, item 2 da fase; bucket
  `edition-pdfs` + 4 policies de Storage) e
  `20260928100100_newspaper_editions_pdf_storage_path.sql` (correção de
  design na mesma fase — ver abaixo). Nenhuma migration anterior alterada.
- **`edition_number` já existia** desde a Fase 17 (`not null unique`) — é
  o campo próprio pedido no item 3; só o domínio (`NewspaperEdition.editionNumber`)
  e a tela passaram a expor/usar de verdade. Duplicidade impedida em dois
  níveis: constraint única no banco (testada real, `23505`) e verificação
  amigável no `NewspaperEditionService` (`DuplicateEditionNumberError`)
  antes de tentar gravar.
- **Bucket `edition-pdfs` é privado** (diferente do bucket de mídias da
  Fase 26, que é público) — decisão desta fase: o PDF da edição é gestão
  interna do backend editorial, não um recurso servido ao portal público
  ainda (`apps/site` continua com seu próprio fluxo de Flipbook/Google
  Drive, intocado). Só staff autenticado lê e escreve. Testado real:
  upload sem sessão rejeitado (`403`, RLS); leitura pública (rota
  `/object/public/...`) nem reconhece o bucket como público
  ("Bucket not found") — confirma que não há vazamento de leitura anônima.
- **Correção de design na mesma fase**: a primeira versão guardava
  `pdf_url` apontando para uma URL assinada do Storage — mas um bucket
  privado gera URLs que expiram, e `pdf_url` seria uma URL "permanente"
  guardada no banco, ficando quebrada mais cedo ou mais tarde. Corrigido
  com uma segunda migration incremental: `pdf_storage_path` guarda o
  caminho real no bucket, e o provider (`newspaperEditionRepository.supabase.ts`)
  gera uma URL assinada nova (1 hora) a cada leitura — nunca expira
  silenciosamente. `pdf_url` continua existindo para o caso de colar uma
  URL externa já hospedada em vez de fazer upload (mesmo padrão de
  `media_assets.public_url`).
- **Nunca exclusão destrutiva**: `setActive(id, false)` é a única remoção
  pela UI — testado real (edição desativada continua existindo na tabela).
- **Integração com Importação de PDF confirmada de ponta a ponta**: uma
  edição cadastrada aparece imediatamente na lista de
  `/sistema/editorial/importar-pdf` (mesma fonte real,
  `NewspaperEditionService.list()`); testado real — edição QA → lote →
  candidato na página 5 → "convertido" em matéria — `newspaper_edition_id`
  e `newspaper_page` confirmados preservados no artigo resultante.
- **Teste real completo** (contra `site-system-ir`, dados removidos ao
  final): criar edição, editar (título/páginas), tentar duplicar número
  (rejeitado), anexar PDF (via `pdf_storage_path`), desativar (sem
  apagar), fluxo completo de importação com edição/página preservados.
  Tudo limpo ao final — `0` linhas restantes nas quatro tabelas
  envolvidas (`newspaper_editions`, `pdf_import_batches`,
  `pdf_import_candidates`, `articles`).
- **RLS/owner intocados**: 32 policies do schema `public` antes e depois
  (Storage tem policies à parte, no schema `storage` — 8 ao todo agora,
  imagens + PDFs); owner continua `role=owner active=true`. Middleware
  confirmado bloqueando `/sistema/editorial/edicoes` e
  `/sistema/editorial/importar-pdf` sem sessão.

## 17. Fase 29 — gestão central de destaques + ajustes visuais do portal

Tela `/sistema/editorial/destaques` (nova) — visão única dos 4 blocos
(Capa principal/Faixa de destaques/Últimas notícias/Mais destaques),
usando `ArticleService.listActivePlacement` já existente. Nenhuma query
Supabase direta na UI. Ajustes visuais do portal (`apps/site`) também
nesta fase — sem migrar o site para o banco real ainda.

- **Migration nova**: `20260929100000_placement_pinned_rank.sql` — coluna
  `pinned_rank` em `article_placements`. Nenhuma migration anterior
  alterada.
- **Ordem manual entre fixadas** (item 1/3 da fase): só faz sentido para
  fixadas (`pinned=true`) — as não fixadas já giram sozinhas por recência,
  reordená-las manualmente entraria em conflito direto com a rotação
  automática. `ArticleService` ganhou `setPlacementPinned`,
  `removeFromPlacement` e `reorderPinnedMainCover` — nenhum deles toca
  editoria/localidade/conteúdo/status (regra fundamental do item 2).
  Testado real: reordenar troca `pinned_rank` corretamente; desafixar
  limpa o rank; remover do destaque encerra só o placement (`active=false`),
  artigo continua `published` com editoria/localidade intactas.
- **"Nossa região" → "Mais destaques"**: só o nome visível mudou (painel
  em `placementLabels`, e o título do bloco em `apps/site`'s
  `LocalSpotlight.tsx`) — identificador interno continua `localSpotlight`,
  sem migration.
- **Hero (`apps/site`)**: máscara de topo/esquerda alargada e mais
  gradual (`FeaturedHero`/`.hero-photo-fg` em `globals.css`) — de
  16%/20% para uma curva em 3 pontos terminando em 34%/42%, eliminando a
  sensação de moldura retangular. Base e direita mantidos como estavam
  (já aprovados). Mobile também ajustado (topo de 5% para 13%).
- **"Leia também"**: novo componente `ReadAlsoCard.tsx` (só foto/título/
  editoria/data/tempo de leitura, sem subtítulo/resumo) — 4 sugestões
  aleatórias (Fisher-Yates) entre as matérias elegíveis, nunca a atual,
  nunca repetida (cada item só existe uma vez na lista de origem).
- **Tempo de leitura**: `readingTime.ts` — calculado a partir do HTML do
  corpo (remove tags, conta palavras, ~200 palavras/min, mínimo 1 min).
  Nunca salvo — `NewsItem.readMinutes` (campo mock antigo) deixou de ser
  usado para exibição em `EditorialCard`/detalhe da matéria; o utilitário
  deriva sempre do conteúdo real, evitando a divergência entre o número
  salvo e o texto de verdade.
- **Footer compacto**: 5 colunas no desktop (marca | editorias A | editorias
  B | institucional | contato) — até 8 editorias cabem em duas colunas de
  até 4 linhas; padding/margens reduzidos (`margin-top` 64px→40px,
  `footer-heading`/`footer-link` mais compactos, faixa de copyright
  40px→mais próxima). Mobile: 1–2 colunas (nunca 5 espremidas).
- **Instagram**: confirmado `@jornal.informativoregional` (já corrigido na
  Fase 26) — sem alteração adicional.
- **RLS/owner intocados**: 32 policies antes e depois; owner continua
  `role=owner active=true`. Middleware confirmado bloqueando
  `/sistema/editorial/destaques` sem sessão.
- **Teste real completo** (contra `site-system-ir`, dados removidos ao
  final): 2 matérias QA publicadas e fixadas em `mainCover`; reordenar
  (`pinned_rank` trocado corretamente); desafixar uma (rank limpo);
  remover a outra do destaque (placement encerrado, `active=false`) —
  confirmado que `title`/`section_id`/`locality_id`/`status` de ambas
  nunca mudaram. Limpo ao final — `0` linhas restantes.

## 18. Fase 30 — Portal público lendo o banco real

`apps/site` passou a consumir conteúdo editorial real do Supabase (home,
matéria, editoria, busca) — mantendo o mock (`newsStorage.ts`/IndexedDB)
só para as páginas explicitamente fora de escopo desta fase (ver
divergências abaixo). Banco real tinha `0` matérias ao iniciar a fase —
os testes usaram dados QA removidos ao final.

### Agendamento real (item 2)

Limitação documentada desde a Fase 25 (`scheduled` nunca virava
`published` sozinho) resolvida com **`pg_cron`** — mecanismo automático
no próprio banco, rodando `public.publish_due_scheduled_articles()` a
cada minuto:
1. Publica (`status='published'`, `published_at=scheduled_at`) toda
   matéria `scheduled` cujo `scheduled_at` já passou.
2. Reafirma o placement ativo dela (`update ... set active=true`) — sem
   isso o gatilho `enforce_placement_limit` (Fase 25) nunca reavaliaria a
   disputa pela vaga 8/3/7/4, porque ele só dispara em INSERT/UPDATE de
   `article_placements`, nunca por causa de um UPDATE em `articles`.

Testado real (`site-system-ir`): matéria agendada para 75s no futuro,
com placement em `mainCover` já com as 8 vagas ocupadas por outras
matérias — antes do horário, não apareceu e não expulsou ninguém;
depois de ~1 execução do cron (até 60s), virou `published` de verdade
(`published_at` preservado = `scheduled_at` original, não o horário do
cron) e disputou a vaga corretamente, evictando 1 das 8 mais antigas —
total permaneceu 8.

### Camada pública seguras (item 3)

Nunca `SELECT` anon irrestrito nas tabelas — RLS das tabelas-base
continua só para `authenticated`/staff, inalterada. Cinco views novas
(dono = papel da migration, que ignora RLS — o filtro de segurança é o
`WHERE` de cada view, não a RLS; testado explicitamente com o cliente
anon, não só revisado):

- `public_editorial_sections` / `public_localities` — só `active=true`.
- `public_articles` — só `status='published'`; nenhum campo administrativo
  (`created_by`/`updated_by`/`internal_reference`/`notification_mode`/
  `origin`) exposto, só o que o portal usa de verdade.
- `public_article_media` — só mídia de matéria `published`, já com
  URL/legenda/crédito resolvidos (`caption_override`/`credit_override`
  com fallback ao padrão de `media_assets`).
- `public_article_placements` — só placements efetivos agora (`active`,
  `published`, dentro da janela `starts_at`/`ends_at`); o corte 8/3/7/4 e
  a ordenação (fixadas por `pinned_rank`, demais por recência) ficam no
  provider público do site (`listPublicPlacement`,
  `apps/site/src/lib/public/publicContentService.ts`), mesma regra de
  `ArticleService.listActivePlacement`.

Testado real com o cliente anon (chave publicável, sem sessão):
`articles`/`profiles`/`media_assets` (tabelas-base) → `[]` sempre; as 5
views → dados reais (7 editorias, 4 localidades, artigos `published`
apenas). Rascunho nunca aparece em `public_articles` nem sua mídia em
`public_article_media` (testado: draft com capa → mídia invisível;
publicado → mídia aparece com URL real). `edition-pdfs` continua privado,
inacessível mesmo pela rota `/object/public/`.

### Editorias/localidades (item 4)

`public_editorial_sections`/`public_localities` alimentam o rodapé real
(`SiteFooter.tsx`, agora Server Component assíncrono) e a nova página
`/editoria/[slug]` (lista matérias publicadas de uma editoria real).
**Divergência documentada**: o menu principal do cabeçalho
(`SiteHeader.tsx`) é uma navegação fixa e cuidadosamente desenhada em
cima do antigo `CategorySlug` (`/geral`, `/saude`, `/esportes`, etc.) —
não tem correspondência 1:1 com as 7 editorias reais (`geral`, `esporte`,
`policia`, `politica`, `economia`, `eventos`, `cidades`; ex.: não existe
`saude`/`colunistas`/`sociais` real, e `esportes`≠`esporte`). Redesenhar
esse menu para ser 100% dirigido pelas editorias reais teria risco alto
de regressão visual no Preview aprovado na Fase 29 — não feito nesta
fase. As páginas antigas por categoria (mock) continuam existindo,
intocadas, como conteúdo de demonstração.

### Matérias públicas (item 5) e Home (item 6)

Provider público novo (`apps/site/src/lib/public/`) — `UI → Service →
Supabase`, nenhuma query direta em componente visual. Home
(`(public)/page.tsx`) virou Server Component (`force-dynamic` — nunca
estática, porque a publicação efetiva muda a cada minuto) lendo os 4
blocos reais via `listPublicPlacement`: Capa principal (8),
Faixa de destaques (3), Últimas notícias (7), Mais destaques (4,
renomeado na Fase 29). Sem conteúdo real, cada bloco simplesmente some
(nenhum mock escondido como fallback) — a home mostra um estado vazio
específico quando não há nenhum destaque real ainda.

### Matéria + Leia também (itens 8/9) e mídia (item 10)

`/noticias/[slug]` virou Server Component real: capa/galeria via
`public_article_media` (URLs reais do bucket público `article-media`,
Fase 26 — nunca o bucket privado `edition-pdfs`), legenda/crédito
resolvidos, tempo de leitura derivado do `body` real
(`readingTime.ts`, Fase 29, sem mudança). "Leia também": 4 sugestões,
metade priorizando a mesma editoria quando há opções suficientes, resto
embaralhado para variedade (Fisher-Yates) — nunca a atual, nunca
repetida. **Simplificação assumida**: o botão "Voltar" perdeu o
comportamento de "smart back" (usava `router.back()` + checagem de
referrer no client) porque a página virou Server Component; agora é um
link fixo para a home — trade-off aceito pela simplicidade e
confiabilidade do SSR.

### Busca (item 11)

`/busca` passou a carregar `public_articles` reais (até 200, filtro em
memória por título/subtítulo/corpo/editoria) com estados de
carregando/vazio/erro. Demais páginas de categoria/`/materias` (CMS mock
de demonstração) permanecem mock nesta fase — mesma divergência do item
4.

### Preview (item 12)

Preview da Fase 29 preservado intacto (deployments da Vercel são
imutáveis por URL — um novo `vercel deploy` nunca sobrescreve um anterior):
`https://jornalir-9zol5yc6v-cristians-projects-34074cc3.vercel.app`.
Novo Preview desta fase publicado à parte.

### Segurança (item 13) e teste temporal (item 14)

RLS das tabelas-base e policies (32 no schema `public`) inalteradas;
owner intocado. Sequência completa testada contra `site-system-ir` (dados
QA removidos ao final): publicada agora → aparece; draft → não aparece;
agendada para o futuro → não aparece nem expulsa vaga; após o horário →
aparece sozinha e disputa a vaga certo; `ends_at` passado → some do
destaque mas a matéria continua pública; arquivada → some de
`public_articles` inteiramente.

## 19. Fase 31 — menu público real (cabeçalho)

`SiteHeader.tsx` deixou de usar `menuConfig.ts` (fixo, baseado no antigo
`CategorySlug`) — agora busca `public_editorial_sections` (Fase 30) direto
no cliente (mesmo padrão já usado por `/busca`), sempre `active=true`, já
na ordem de `sort_order` da própria view.

- **Sem redesenho visual**: mesma estrutura "flat + Mais" de antes, só a
  fonte dos links mudou. As 4 primeiras editorias reais (por `sort_order`)
  ficam direto no header, junto com "Jornal Online" (link fixo, não é
  editoria); o resto das editorias + "Sobre"/"Contato" vão para "Mais" —
  crescimento de editorias nunca aumenta a altura do header, só o
  dropdown "Mais".
- **Menu mobile**: lista todas (flat + overflow) igual antes, agora com
  editorias reais.
- **Fallback sem mock escondido** (item 6): enquanto carrega ou se a
  consulta falhar, o header nunca quebra — mostra só a estrutura mínima
  (Início, Busca, Sobre, Contato via "Mais"), nunca volta a exibir a
  lista fixa antiga como se fosse real.
- **Rodapé inalterado** (já era real desde a Fase 30) — mesma fonte
  (`listPublicSections`), mesmos slugs/nomes, sem divergência entre
  cabeçalho e rodapé.
- **Teste real**: build/typecheck limpos; Preview validado com as 7
  editorias reais aparecendo (4 no header + 3 em "Mais", junto com
  Sobre/Contato); nenhuma editoria inativa apareceu (nenhuma inativa
  existe no banco atualmente, mas a view já filtra `active=true` na
  fonte, mesmo mecanismo testado na Fase 30).

## 20. Fase 32 — consolidação da navegação pública por editoria

Rota oficial de navegação por editoria: **`/editoria/[slug]`** — única
implementação a partir de agora. As 7 páginas antigas de categoria (mock,
`CategoryTemplatePage`) foram auditadas uma a uma:

- **`/geral`, `/esportes`, `/policia`, `/politica`** têm equivalência
  real e segura (`editorial_sections.slug`: `geral`, `esporte`, `policia`,
  `politica`) — removidas e substituídas por **redirect permanente
  (308)** em `next.config.mjs` (`redirects()`), não por página. Testado
  real (build de produção local): os 4 caminhos antigos respondem `308`
  para `/editoria/{slug}` correto.
- **`/saude`, `/colunistas`, `/sociais`** não têm nenhuma editoria real
  correspondente no banco — inventar um redirect seria "chutar" a
  editoria errada (proibido explicitamente pela fase). Removidas sem
  redirect — respondem `404` real (testado). Nenhum link interno do site
  real apontava para elas (auditado por busca de texto no código antes de
  remover).
- **`/noticias`** (índice "todas as notícias", diferente de
  `/editoria/[slug]$` que filtra por uma editoria) deixou de usar o mock
  — agora lista `public_articles` real sem filtro de seção. É o destino
  real do link "Ver todas" de Últimas notícias (`PublicLatestNewsList`),
  que já apontava para cá e continuou funcionando sem mudança.
- `CategoryTemplatePage.tsx`, `EditorialSection.tsx` (variante de listagem
  por editoria, zero referências) e `menuConfig.ts` (lista fixa de menu,
  zero referências desde a Fase 31) removidos — nenhum arquivo restante
  os importa.
- **Não removido, fora de escopo desta fase**: outros componentes mock já
  órfãos antes desta fase (`FeaturedHero.tsx`, `LatestNewsList.tsx`,
  `LocalSpotlight.tsx`, `ReadAlsoCard.tsx` — mock, superados pelas
  versões `Public*` desde a Fase 30) continuam existindo; não quebram
  nada, só não são mais usados por nenhuma rota real. `EditorialCard.tsx`
  continua em uso por `NewsFeedWithAds.tsx` (componente pré-existente,
  também não roteado). `/materias` (CMS mock de demonstração) e
  `newsStorage.ts`/IndexedDB continuam intocados — não são páginas de
  categoria, são o editor de demonstração do portal.
- **Preview antigo preservado**: deployments da Vercel são imutáveis por
  URL — remover arquivos-fonte não afeta builds já publicados
  (confirmado nas Fases 29/30/31, reafirmado aqui).
- Build de produção local: 15 rotas (antes 22) — as 7 removidas nunca
  mais aparecem como página própria; `/noticias`/`/editoria/[slug]`
  seguem dinâmicas (`force-dynamic`).

## 21. Fase 33 — preparação para migração do site legado

Regra central da fase: o site antigo se adapta ao modelo novo, nunca o
contrário; nenhuma informação histórica pode ser perdida. **Nenhum
conteúdo foi importado nesta fase** — só a estrutura foi preparada e
testada com dados QA (removidos ao final).

- **Editorias completas**: `Saúde`, `Sociais`, `Colunistas` adicionadas
  (`sort_order` 7/8/9) — as 7 já existentes (`Economia`/`Eventos`/
  `Cidades` incluídas) permanecem, mesmo sem correspondência no legado.
  10 editorias reais no total.
- **Autoria opcional**: `articles.author_name` (nullable) — nunca
  obrigatória em matéria nova; usada como byline quando preenchida. Uma
  matéria de coluna continua em `Colunistas` (editoria), o nome da pessoa
  fica à parte — nunca "cada colunista vira uma editoria".
- **`origin` ganha `legacy_site`**: `articles_origin_check` agora aceita
  `manual`/`pdf`/`legacy_site` — nunca marcar conteúdo importado como
  `manual`. `ArticleService` ganhou `importLegacyArticle()` (packages/core)
  — diferente de `saveDraft`/`importAsDraft`: nasce direto `published`,
  com `publishedAt` = data ORIGINAL informada (nunca a data de
  importação; `created_at` técnico continua sendo a data real da
  importação). Ainda sem nenhum importador real chamando isso — só a
  capacidade existe, testada via QA.
- **`article_external_sources`** (tabela nova): rastreabilidade completa
  de conteúdo importado — `provider`, `external_id`, `source_url`,
  `source_slug`, `original_category`/`original_subcategory`/
  `original_author`, `original_published_at`/`original_updated_at`,
  `imported_at`, `last_synced_at`, `source_hash`, `raw_metadata` (jsonb).
  RLS só staff (nunca exposta ao público — é metadado de migração, não
  conteúdo editorial). Deduplicação garantida por dois índices únicos
  parciais: `(provider, external_id)` quando há id externo, `(provider,
  source_url)` como alternativa — testado real: tentar importar o mesmo
  `external_id` ou a mesma `source_url` duas vezes é rejeitado (`23505`)
  nos dois casos. Provider inicial documentado: `informativo_regional_legacy`.
- **Mídia legada**: `media_assets.origin_source_url` (nullable) — preserva
  a URL original do site antigo mesmo depois de `storage_path`/
  `public_url` passarem a apontar para uma cópia no Storage próprio
  (etapa definitiva, fora desta fase). `public_url` já aceitava qualquer
  URL externa desde a Fase 17 — nenhuma mudança necessária aí.
- **Portal absorve as novas editorias automaticamente**: `/editoria/saude`,
  `/editoria/sociais`, `/editoria/colunistas` testados reais, `200`, sem
  nenhuma mudança de código em `apps/site` — a arquitetura genérica desde
  a Fase 30/32 já lida com qualquer editoria ativa nova.
- **Achado real e corrigido nesta fase (bug pré-existente desde a Fase
  30)**: o `supabase-js` do portal não define `cache` nas próprias
  chamadas `fetch`, e o Next.js App Router cacheia `fetch` por padrão —
  `dynamic = "force-dynamic"` na página não bastava para páginas que só
  dependiam de dado do Supabase através de um componente como
  `SiteFooter` (usado em `layout.tsx`, sem `force-dynamic` próprio).
  Sintoma real: `/editoria/saude` respondia `404` mesmo com a editoria
  real já existindo e confirmada via `curl` direto à API do Supabase —
  uma rota de diagnóstico temporária confirmou que o servidor via só 7
  editorias enquanto o banco já tinha 10. Corrigido configurando
  `global.fetch` do cliente público (`supabasePublicClient.ts`) para
  sempre `cache: "no-store"` — resolve para toda leitura pública do
  portal, não só a página de editoria. Efeito colateral bom: páginas antes
  estáticas (`/sobre`, `/contato`, etc.) viraram dinâmicas (o rodapé real
  agora sempre atualizado) — antes, essas páginas serviam um rodapé
  potencialmente desatualizado, congelado no momento do build.
- **RLS**: 35 policies no schema `public` agora (32 + 3 de
  `article_external_sources`) — nenhuma das 32 anteriores alterada; owner
  intocado.
- **Teste real completo** (contra `site-system-ir`, dados QA removidos ao
  final): matéria `manual` e `pdf` continuam funcionando; matéria
  `legacy_site` com `author_name` e data original (`2019-03-15`, não
  "hoje") criada e confirmada; origem externa criada e persistida;
  duplicidade bloqueada nos dois caminhos (`external_id` e `source_url`);
  10 editorias visíveis via `public_editorial_sections` para o cliente
  anon; `article_external_sources` confirmado bloqueado para anon; portal
  abriu as 3 novas editorias reais depois da correção do cache.

## 22. Próxima fase (sugestão)

Estrutura pronta para receber o conteúdo do site antigo. Caminho natural:
construir o importador real (scraping/sincronização), usando
`ArticleService.importLegacyArticle` + `article_external_sources` já
preparados; ou popular o banco com as primeiras matérias reais de
produção manual.
