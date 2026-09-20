# PROMPT — FASE 08 — IMPORTAÇÃO DE PDF / REVISÃO DE CANDIDATOS

Branch: `feature/jornalir-core-foundation-20260917`.

## Objetivo

Criar o fluxo completo de importação e revisão de candidatos de matéria,
ainda com candidatos simulados (sem parser/OCR real).

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md` (Parte G)
- `docs/HANDOFF-CODEX.md` (Fases 04 a 07)

## Escopo

Criar `/sistema/editorial/importar-pdf` com o fluxo: selecionar edição
existente → selecionar um PDF local apenas para simular o processamento →
gerar candidatos mock → revisar candidato por candidato em
`/sistema/editorial/importar-pdf/[candidateId]`.

Na revisão, permitir: manter, descartar, editar título/subtítulo/corpo
(reaproveitando o editor de texto da Fase 07), escolher editoria/localidade,
vincular página da edição, visualizar imagens candidatas (e ajustar
capa/galeria reaproveitando o seletor de mídia da Fase 06), mesclar
candidatos (seleção múltipla na lista) e dividir um candidato em dois.
Candidato aprovado converte em rascunho real via `ArticleService`
(`importAsDraft`).

## Regras

- nada publica automaticamente — candidato convertido sempre nasce rascunho;
- publicidade detectada (candidato sem editoria sugerida, no lote mock) pode
  ser descartada;
- descarte e mesclagem nunca apagam registros — apenas mudam o status para
  "discarded" (mantém histórico/rastreabilidade, sem exclusão destrutiva);
- matéria importada mantém vínculo com `editionId`/`editionPageNumber`;
- usar services/repositories (`ImportCandidateService`,
  `NewspaperEditionService`, novos e mínimos, simétricos aos já existentes)
  — nenhuma tela ou Server Action importa `@ir/mocks` diretamente; a escolha
  do gerador mock fica inteiramente na composição
  (`composition/editorial.ts`).

## Não implementar nesta fase

Parser real de PDF, OCR, IA, extração real de imagens, Supabase, upload
remoto. A seleção do arquivo é só visual (nome exibido, nada é enviado).

## Preservar

`apps/site` não é tocado: flipbook, leitor atual, Google Drive e acervo
existente permanecem exatamente como estão.

## Automação

Crie você mesmo:
- `automation/prompts/08-importacao-pdf.md`
- `automation/scripts/08-importacao-pdf.ps1`

Não pedir nada manual ao usuário.

## Validação

Somente ao final: typecheck, build do sistema, e validação real (camada de
serviço, reproduzindo o que as Server Actions fazem) de: criação de
rascunho a partir de candidato, descartar, mesclar, dividir e vínculo
edição/página.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com o resultado da fase.

## Commit

`feat: adiciona fluxo de importacao e revisao de PDF`

Push apenas da feature branch.
