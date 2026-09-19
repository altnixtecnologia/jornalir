# JORNALIR — FASE 01 — CONSOLIDAR DOCUMENTAÇÃO E SUBIR A BRANCH

Você está no repositório `altnixtecnologia/jornalir`.

## Contexto confirmado

- Branch de trabalho esperada: `feature/jornalir-core-foundation-20260917`
- Base conhecida: `2bf8a7e272a6f9aa0797261f635ee07f309357f8`
- Nesta fase, os documentos arquiteturais já foram produzidos.
- Nenhum código funcional deve ser alterado nesta fase.
- Nenhuma integração externa deve ser criada.

## Objetivo

Consolidar a rodada documental no Git, criar um único commit coerente e subir a branch para o GitHub.

## Antes de qualquer escrita

1. Execute:
   - `git status --short`
   - `git branch --show-current`
   - `git rev-parse HEAD`
2. Confirme que a branch atual é `feature/jornalir-core-foundation-20260917`.
3. Se estiver em `main`, PARE.
4. Se houver alterações funcionais em código além dos documentos esperados, PARE e reporte.
5. Não usar `git reset --hard`, `git clean`, force push, merge ou rebase destrutivo.

## Arquivos esperados

Em `docs/`:

- `PLANO-MESTRE-JORNALIR.md`
- `PROMPT-MESTRE-CODEX-JORNALIR.md`
- `CURRENT-STATE.md`
- `ARCHITECTURE.md`
- `FRONTEND-STRUCTURE.md`
- `DATA-BOUNDARIES.md`
- `HANDOFF-CODEX.md`

Além dos documentos históricos já existentes:

- `estrutura-banco-anuncios.md`
- `estrutura-banco-materias.md`

Pode existir também na raiz:

- `REESTRUTURACAO-PROJETO-GPT.md`

Preserve o conteúdo existente.

## Execução

1. Revise rapidamente os documentos.
2. Confirme que links Markdown locais apontam para arquivos existentes.
3. Adicione somente os arquivos documentais esperados.
4. Faça um único commit:

`docs: define arquitetura e estado atual do JornalIR`

5. Faça push somente da feature branch atual:

`git push -u origin feature/jornalir-core-foundation-20260917`

6. Não abrir PR, não mergear, não tocar em `main`.

## Validação

Como esta fase é documental:

- não rodar build;
- não rodar typecheck;
- não iniciar servidor.

No final execute apenas:

- `git status --short`
- `git log -1 --oneline`
- `git branch --show-current`

## Retorno obrigatório

```text
VERDICT:
COMPLETE / PARTIAL / BLOCKED

BRANCH:
...

COMMIT:
...

PUSH:
...

ARQUIVOS INCLUÍDOS:
...

GIT STATUS FINAL:
...

OBSERVAÇÕES:
...
```

Pare ao concluir.
