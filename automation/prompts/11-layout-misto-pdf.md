# PROMPT — FASE 11 — ORDEM DE LEITURA EM DIAGRAMAÇÃO MISTA

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Melhorar a segmentação de páginas com regiões/colunas diferentes, sem
alterar texto. Implementar detecção de colunas por região vertical,
permitindo que uma mesma página tenha estruturas diferentes em faixas
distintas — corrigindo a limitação documentada como Achado 2 da Fase 10
(`docs/PDF-REAL-VALIDATION.md`): matéria larga ao lado de uma coluna
estreita (ex.: horóscopo) podia ter seu texto embaralhado porque a detecção
de colunas olhava só para a página inteira de uma vez.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04 a 10)
- `docs/PDF-REAL-VALIDATION.md` (Achado 2, especialmente)

## Prioridade absoluta

- zero perda textual;
- zero duplicação;
- zero alteração de caracteres;
- ordem de leitura correta;
- nenhuma correção automática de texto.

## Escopo

Detecção de colunas por região vertical (`packages/pdf-extraction`): a
página é amostrada em bandas horizontais, a estrutura de colunas de cada
banda é medida de forma independente (mesma técnica de vão de tinta da
Fase 09), e bandas adjacentes com a mesma estrutura são fundidas em uma
única região. O resto do pipeline (parágrafos, matérias, conservação) deve
permanecer genérico sobre o conceito de "coluna" — cada segmento
(região × coluna) se comporta exatamente como uma coluna das fases
anteriores.

Usar como referência principal as páginas reais já identificadas como
problemáticas na Fase 10 (Achado 2 e, em menor grau, Achado 3).

## Revalidação obrigatória

Revalidar as 8 páginas reais já testadas na Fase 10
(`packages/pdf-extraction/scripts/validate-real-pdfs.ts`) para garantir que
nenhuma regressão de conservação foi introduzida (cobertura, órfãos,
duplicados, alterados, fora de ordem).

## Correções

Só aplicar correção quando houver regra determinística segura baseada em
layout — nunca adivinhando conteúdo. Se uma falha real persistir e não
houver regra segura aplicável (ex.: diagramação em grade genuinamente
bidimensional), documentar como limitação conhecida em vez de forçar uma
correção arriscada ou super-ajustada a uma página específica.

## Não implementar nesta fase

OCR, IA, correção automática de texto, extração avançada de imagens,
Supabase.

## Automação

Crie você mesmo:
- `automation/prompts/11-layout-misto-pdf.md`
- `automation/scripts/11-layout-misto-pdf.ps1`

## Validação

Somente ao final: testes do pacote de PDF, typecheck, build do sistema,
comparação nas páginas reais (sem regressão de conservação).

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` e `docs/PDF-REAL-VALIDATION.md` com o
resultado da fase.

## Commit

`fix: melhora ordem de leitura em layouts mistos`

Push apenas da feature branch.
