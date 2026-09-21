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
| `profiles` | Perfil complementar a `auth.users` | Criada automaticamente por trigger (`handle_new_auth_user`) ao nascer um `auth.users`; role inicial sempre `editorial`. Promover a `admin` é uma ação deliberada, nunca o padrão. |
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

Dois papéis (`profiles.role`): `admin` e `editorial`. Nesta fase **ambos têm
o mesmo acesso ao conteúdo editorial** (matérias, editorias, localidades,
mídias, importação de PDF, publicação) — a distinção prática hoje é que só
`admin` gerencia outros `profiles` (promover, ativar/inativar) e só `admin`
lê `audit_events`. Sem permissões de financeiro/CRM ainda porque esses
módulos não existem.

Padrão de policy em toda tabela de negócio: `select`/`insert`/`update` para
`is_active_staff()` (função `SECURITY DEFINER`, evita recursão de RLS ao
consultar `profiles`); **sem `delete`** — a remoção sempre é reversível
(`active=false`, `status='archived'`, etc.), exceto em `article_media`
(remover uma foto de uma matéria é uma operação normal e não destrutiva; a
mídia em si continua existindo na biblioteca).

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

**Nesta fase, nenhuma das duas execuções acima foi rodada** — as migrations
foram preparadas e revisadas estaticamente, mas a validação real (aplicar
do zero, testar RLS/admin/editorial, criar matéria de teste) fica para
quando alguém rodar um dos comandos acima com as próprias credenciais.

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

## 7. Próxima fase (sugestão)

Migração provider-por-provider (`apps/sistema` primeiro, matérias/editorias/
localidades/mídias/importação de PDF), reconciliando as divergências da
seção 4, seguida de auth real substituindo a sessão mock (`AuthGate`/
`mockSession.ts`, Fase 16), e só depois `apps/site` passando a ler
`published` diretamente do banco com RLS pública.
