# PROMPT — FASE 05 — LISTA DE MATÉRIAS

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Ligar a UI do sistema ao domínio editorial já criado na Fase 04, com a
primeira tela real do CMS.

## Ler antes de alterar

- `docs/HANDOFF-CODEX.md` (Fase 04)
- `docs/PLANO-MESTRE-JORNALIR.md`

## Escopo

Criar `/sistema/editorial/materias` consumindo `ArticleService` via
`apps/sistema/src/composition/editorial.ts`. Não importar fixtures de
`@ir/mocks` diretamente nas páginas.

Mostrar por matéria: referência interna, título, editoria, localidade,
status, publicação/programação, destaque quando houver, notificação e
indicação de imagem/capa.

Filtros no frontend: busca por texto, status, editoria, localidade — usando
os services/repositories existentes (filtragem sobre a lista já carregada).

Ações visíveis: Nova matéria, Abrir/editar, visualizar estado. Sem editor
completo — "Nova matéria" e "Abrir" levam a páginas simples que mostram o
estado atual, não um formulário completo.

Seguir o shell administrativo já existente (CSS próprio, sem Tailwind, sem
biblioteca de UI nova). Listagem densa em tabela — nunca transformar cada
matéria em card.

## Não tocar / não implementar

Preservar portal, IndexedDB atual, flipbook, jornal digital e
anúncios/patrocinadores. Não implementar editor completo, galeria, upload,
programação avançada, PDF, Supabase, autenticação ou redesign do site
público.

## Validação

Somente ao final: typecheck do sistema, build do sistema e validação da rota
nova. Não testar a cada alteração.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: adiciona listagem editorial de materias`

Push apenas da feature branch.
