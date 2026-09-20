# PROMPT — FASE 09 — EXTRAÇÃO REAL DE PDF COM FIDELIDADE TEXTUAL

Branch: `feature/jornalir-core-foundation-20260917`. Fase crítica.

## Objetivo

Substituir o gerador mock de candidatos (Fase 08) por leitura real do PDF,
priorizando fidelidade textual acima de automação agressiva.

## Regra principal

Nunca inventar, completar, resumir, reescrever ou "corrigir" silenciosamente
o texto extraído. Distinguir texto extraído com segurança, texto duvidoso,
texto ausente e (futuramente) texto sugerido. Sem IA para reconstruir
conteúdo faltante nesta fase.

## Ler antes de alterar

- `docs/PLANO-MESTRE-JORNALIR.md` (Parte G)
- `docs/HANDOFF-CODEX.md` (Fases 04 a 08)

## Estratégia

1. Detectar camada de texto (pdfjs-dist, build "legacy" para Node).
2. Extração direta de texto/posição quando houver camada de texto.
3. OCR só como fallback — interface `OcrProvider` pluggable; sem
   implementação real nesta fase (ver decisão no handoff sobre dependências
   nativas/binárias).
4. Preservar caracteres, acentos, pontuação, parágrafos, ordem de leitura,
   página de origem.
5. Detectar colunas por vãos de tinta (análise de layout, não de conteúdo).
6. Não misturar colunas ou matérias diferentes; sinalizar continuação
   provável em vez de mesclar automaticamente (reaproveita o "mesclar" já
   existente na Fase 08).
7. Sinalizar blocos curtos e isolados como possível publicidade, sem
   descartar automaticamente.

## Pipeline (pacote isolado `@ir/pdf-extraction`)

`PDF → páginas → blocos com coordenadas → agrupamento (linhas → parágrafos
→ matérias) → candidatos`, com rastreabilidade até página/coluna/bloco em
cada candidato (`ImportCandidate.extraction`).

Heurística de título/subtítulo/corpo: determinística, por tamanho de fonte
predominante do corpo (ponderado por caracteres, não por contagem de
parágrafos — evita empates com poucas amostras), posição e vãos. Nunca por
conteúdo textual. Sem confiança suficiente: mantém tudo como corpo e
sinaliza para revisão.

## Reutilização

`pdfjs-dist` já existe em `apps/site` (uso client-side/browser). Nesta fase,
o mesmo pacote é usado no build "legacy" para Node (server-side, dentro de
Server Actions), com a mesma versão declarada em `@ir/pdf-extraction`. Não
adicionar `canvas`/`@napi-rs/canvas`/`tesseract.js` — avaliado e descartado
nesta fase (ver handoff).

## Testes obrigatórios

Fixtures de PDF geradas via `pdf-lib` (não binários versionados): uma
coluna; duas colunas; título+subtítulo+corpo; caracteres acentuados (com
linha fragmentada em dois itens de texto); página com bloco isolado
(publicidade); matéria continuando em outra coluna; página sem camada de
texto. Para fixtures com camada de texto, exigir correspondência exata
(não "parecido"); para a página sem texto, validar apenas a sinalização
honesta (sem OCR real disponível).

## Segurança

Não alterar `apps/site`, flipbook, Google Drive, IndexedDB legado ou
anúncios/patrocinadores. Não implementar Supabase, IA, publicação
automática, correção automática de texto ou integração externa paga.

## Automação

Crie você mesmo:
- `automation/prompts/09-extracao-real-pdf.md`
- `automation/scripts/09-extracao-real-pdf.ps1`

Não pedir criação manual ao usuário.

## Validação

Somente ao final: typecheck, build, testes do pacote de extração (fidelidade
textual exata) e validação de integração (extração real → candidato →
revisão → conversão em rascunho) na composição real do `apps/sistema`.

## Handoff

Atualizar `docs/HANDOFF-CODEX.md` com pipeline, decisões, limitações e
relatório de fidelidade por fixture.

## Commit

`feat: adiciona extracao fiel de materias do PDF`

Push apenas da feature branch.
