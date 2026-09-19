# PROMPT — FASE 04 — DOMÍNIO EDITORIAL

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Estruturar o domínio editorial do JornalIR sem banco real e sem ampliar o
frontend. Fundação para o CMS que virá no próximo lote.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND-STRUCTURE.md`
- `docs/DATA-BOUNDARIES.md`
- `docs/HANDOFF-CODEX.md`

## Escopo

### `packages/types`

Contratos de domínio editorial: `UserRole`, `ArticleStatus`, `NotificationMode`,
`EditorialSection`, `Locality`, `EditorialPlacement`, `Article`, `MediaAsset`,
`ArticleMedia`, `NewspaperEdition` e contratos mínimos de importação de PDF.

Regras: toda matéria tem editoria; localidade é independente; imagem e
subtítulo são opcionais; várias imagens podem formar galeria; uma pode ser
capa; destaque não altera a editoria; publicação é explícita; matéria
importada entra como rascunho.

### `packages/core`

Somente o necessário para Editorial: `ArticleRepository`,
`EditorialSectionRepository`, `LocalityRepository`, `ArticleService` e
serviços simples de editorias/localidades.

Fluxo: `UI → Service → Repository → Provider`. Sem React, IndexedDB ou
Supabase dentro do core.

### `packages/mocks`

Provider mock em memória implementando os contratos de `core`. Dados
suficientes para cobrir: publicada, programada, rascunho, com/sem imagem,
galeria, diferentes editorias/localidades, manchete, urgente e matéria
vinculada a uma edição do jornal.

### `apps/sistema`

Apenas o ponto de composição do Editorial ligando `MockRepository → Service`.
Não desenvolver novas telas nesta fase.

## Não tocar / não implementar

Preservar portal, IndexedDB atual, flipbook, jornal digital e
anúncios/patrocinadores. Não implementar Supabase, migrations, autenticação,
upload, OCR/PDF real, IA, financeiro, clientes, WhatsApp, app mobile ou
redesign do portal.

## Validação

Somente ao final: typecheck dos pacotes alterados, typecheck/build do
sistema, e o site apenas se os tipos compartilhados afetarem sua compilação.
Não testar a cada alteração.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: estrutura dominio editorial do JornalIR`

Push apenas da feature branch.
