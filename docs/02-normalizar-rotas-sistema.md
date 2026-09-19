# JORNALIR — FASE 02 — NORMALIZAR ROTAS DO SISTEMA

Você está no repositório `altnixtecnologia/jornalir`, na branch:

`feature/jornalir-core-foundation-20260917`

Leia antes:

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/CURRENT-STATE.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND-STRUCTURE.md`
- `docs/DATA-BOUNDARIES.md`
- `docs/HANDOFF-CODEX.md`

## Objetivo único

Corrigir a organização de rotas de `apps/sistema` para eliminar a provável duplicação `/sistema/sistema`, preservando as páginas existentes.

A recomendação documental é:

- remover `basePath: "/sistema"` de `apps/sistema/next.config.mjs`;
- manter `src/app/sistema` como responsável pelo prefixo `/sistema`.

## Escopo

Obter:

```text
/sistema
/sistema/anuncios
/sistema/patrocinadores
```

Revise apenas o necessário em:

- `apps/sistema/next.config.mjs`
- links internos
- `Link`
- `router.push`
- redirects
- caminhos que dependam do `basePath`

## Preservar

- conteúdo das páginas existentes;
- anúncios;
- patrocinadores;
- estrutura do monorepo;
- site público;
- flipbook;
- Google Drive;
- packages compartilhados.

## Não fazer

Não:

- criar shell novo ainda;
- criar CMS ainda;
- mover `/materias` do portal;
- criar `packages/core`;
- alterar tipos editoriais;
- instalar dependências;
- alterar Next.js/React/Tailwind;
- criar redirects de produção sem necessidade comprovada;
- alterar Vercel/DNS;
- fazer deploy;
- tocar em Supabase.

## Validação

Somente ao final:

1. `npm run typecheck --workspace @ir/sistema`
2. `npm run build --workspace @ir/sistema`

Não testar a cada comando.

## Git

- permanecer na feature branch;
- não tocar em `main`;
- commit:

`fix: normaliza rotas do sistema administrativo`

- push da feature branch após validação.

## Handoff

Atualize `docs/HANDOFF-CODEX.md` com:

- mudança;
- arquivos alterados;
- resultado de typecheck/build;
- commit;
- riscos restantes.

## Retorno

```text
VERDICT:
COMPLETE / PARTIAL / BLOCKED

BRANCH:
...

COMMIT:
...

ALTERACOES:
...

ROTAS FINAIS:
...

VALIDACAO:
...

RISCO/PENDENCIA:
...

PROXIMA FASE:
Fase 03 — shell administrativo + estrutura visual
```

Pare ao concluir.
