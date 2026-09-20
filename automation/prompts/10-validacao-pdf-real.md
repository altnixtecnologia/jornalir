# PROMPT — FASE 10 — VALIDAÇÃO COM PDFs REAIS DO JORNAL

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Provar a fidelidade do pipeline de extração da Fase 09 usando edições reais
já existentes no acervo do JornalIR, não apenas fixtures sintéticas.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md`
- `docs/HANDOFF-CODEX.md` (Fases 04 a 09)

## Escopo

### PDFs reais

Localizar PDFs reais já existentes (`apps/site/public/uploads/jornal-online/`).
Somente leitura — nunca alterar ou mover esses arquivos. Escolher páginas
representativas (uma matéria; várias matérias; duas ou mais colunas;
anúncios entre matérias; títulos grandes; subtítulos; textos longos;
acentos; continuações), documentando o critério de escolha de cada uma.

### Conservação textual — nova camada de auditoria

Dar identidade estável a cada bloco de texto detectado (`Paragraph.id`,
propagado a `ArticleBlock.paragraphId`) e expor o catálogo completo de
parágrafos por página (`PageExtraction.paragraphs`). Criar um módulo
independente (`checkConservation`) que audita — sem decidir nem corrigir
nada — se cada bloco foi usado, se algum ficou órfão, se algum foi usado
duas vezes, se algum teve o texto alterado, e se a ordem de leitura dentro
de cada candidato bate com a ordem de origem. Gerar métricas por página:
blocos encontrados/usados/órfãos, duplicações, cobertura (por contagem e por
caracteres), avisos.

### Diagnóstico real

Script permanente (`packages/pdf-extraction/scripts/validate-real-pdfs.ts`)
que roda o pipeline + a checagem de conservação sobre as páginas escolhidas
e imprime as métricas. Relatório técnico em `docs/PDF-REAL-VALIDATION.md`
com arquivo, página, colunas, candidatos, cobertura, blocos órfãos, avisos,
possíveis problemas de ordem e resultado geral — nunca alterando o texto
para melhorar o resultado.

### Interface

Na revisão de candidato (Fase 08), mostrar discretamente: cobertura da
página, blocos não associados, alerta quando houver risco de perda/ordem —
tanto na listagem quanto no detalhe.

### Correções

Só aplicar correção quando houver regra determinística segura baseada em
layout (tamanho, posição, padrão de maiúsculas/minúsculas) — nunca
adivinhando conteúdo. Se uma falha real for encontrada e não houver regra
segura aplicável, documentar como limitação conhecida em vez de forçar uma
correção arriscada.

## Não implementar nesta fase

OCR real, IA, correção automática de texto, extração avançada de imagens,
Supabase.

## Automação

Crie você mesmo:
- `automation/prompts/10-validacao-pdf-real.md`
- `automation/scripts/10-validacao-pdf-real.ps1`

## Validação

Somente ao final: testes do pacote de PDF (incluindo os novos testes de
conservação), typecheck, build do sistema, execução do diagnóstico sobre os
PDFs reais selecionados, relatório de cobertura.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`test: valida extracao em edicoes reais do jornal`

Push apenas da feature branch.
