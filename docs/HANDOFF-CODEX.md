# Handoff — JornalIR

## Fase 10 — validação com PDFs reais do jornal (20/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `4a6ca58` (commit da Fase 09).
- Entrega: prova de fidelidade do pipeline da Fase 09 contra 8 páginas reais escolhidas de 3 edições do acervo do JornalIR (7 PDFs, 24 páginas cada, 168 páginas inspecionadas para a escolha), mais uma nova camada independente de auditoria de conservação textual, integrada à revisão da Fase 08. Relatório completo em `docs/PDF-REAL-VALIDATION.md`.

### PDFs reais — só leitura

Localizados em `apps/site/public/uploads/jornal-online/` (`IR 685/687/696/697/698/699/700_compressed.pdf`, já usados pelo flipbook do portal). Nenhum foi alterado, movido ou reescrito — confirmado via `git status` sobre esse diretório antes do commit. Todas as 168 páginas têm camada de texto real (nenhuma página digitalizada/sem texto encontrada no acervo testado, então o caminho "sem OCR disponível" não foi exercitado com dados reais nesta fase — permanece coberto pelos testes sintéticos da Fase 09).

### Nova camada: conservação textual (`packages/pdf-extraction/src/conservation.ts`)

Auditoria independente — não confia no agrupamento em matérias, reconta do zero a partir do catálogo bruto de parágrafos da página:

- `Paragraph` ganhou `id` (`c{coluna}-p{índice}`) e `column`; `ArticleBlock` ganhou `paragraphId` apontando para o parágrafo de origem; `PageExtraction` ganhou `paragraphs: Paragraph[]` — o catálogo completo, base de verdade para a auditoria.
- `checkConservation(page)`: para cada parágrafo, verifica se foi usado em exatamente um bloco (órfão = 0 usos; duplicado = 2+ usos), se o texto do bloco bate exatamente com o do parágrafo de origem (alterado = não bate), e se a ordem dos blocos dentro de cada candidato respeita a ordem vertical dos parágrafos de origem na coluna (fora de ordem). Produz `blocksFound`, `blocksUsed`, `orphanBlocks`, `duplicatedBlocks`, `alteredBlocks`, `reorderedBlockIds`, `coverageByCount`, `coverageByChars` e avisos — nunca decide nem corrige nada.
- Rodada automaticamente ao final de `extractPage` no pipeline; os avisos entram na mesma lista de avisos da página (sem canal oculto).
- 5 testes novos (`test/conservation.test.ts`), incluindo cenários sintéticos deliberadamente quebrados (órfão, duplicado, alterado, fora de ordem) para provar que o checador realmente detecta cada categoria — não só um teste de "caminho feliz".

### Achados reais (via diagnóstico contra as 8 páginas) e correções aplicadas

Ver `docs/PDF-REAL-VALIDATION.md` para o relatório completo com tabela por página. Resumo:

1. **Cobertura textual: 100% em todas as 8 páginas reais testadas** — zero blocos órfãos, zero duplicados, zero alterados, zero fora de ordem. Confirma com dados reais a garantia estrutural do pipeline (nenhum caminho de código descarta um parágrafo silenciosamente).
2. **Achado real — mapeamento de fonte quebrado em títulos**: em 6 das 8 páginas, uma fonte de título do PDF de origem mapeia o glifo de "N" (e, em outra edição, "ã"/"h") para o Unicode minúsculo (`"APRESEnTA"`, `"CITADIn"`, `"GOVERnO"`, `"MOÇãO"`, `"GUILhERME"`...). Confirmado inspecionando os itens brutos do `pdfjs-dist`: o defeito já vem assim do PDF, não é introduzido pela junção de linhas. **Correção**: `hasIsolatedLowercaseInUppercaseRun` (novo, em `warnings.ts`) — detector determinístico por padrão de maiúscula/minúscula por palavra (nunca por conteúdo), com exclusão deliberada do plural comum de sigla ("PDFs"). Só sinaliza; nunca corrige a letra.
3. **Achado real — "título" implausivelmente longo**: na página 4, uma ata de câmara diagramada em grade densa produziu um parágrafo de 900+ caracteres que, por estar em fonte maior que o corpo, virava um "título" absurdo. **Correção**: `articleGroups.ts` só aceita um parágrafo como título quando tem no máximo 160 caracteres; acima disso, o grupo cai para baixa confiança (tudo mantido como corpo, sinalizado para revisão) — verificado antes/depois com o mesmo parágrafo real.
4. **Limitação real, documentada, não corrigida**: diagramação mista (matéria corrida ao lado de coluna estreita, ex.: horóscopo) pode embaralhar a ordem de leitura dentro de uma coluna mal segmentada pelo detector global de vãos — sem perda de texto (cobertura continua 100%), mas com risco de leitura confusa. Corrigir exigiria detecção de colunas por região vertical da página, mudança de algoritmo maior, fora do escopo desta fase de validação.
5. **Página inteira de publicidade com pouco texto**: comportamento correto, não uma falha — candidatos triviais e óbvios de descartar, a própria página já se rotula "Publicidade".

### Integração com a Fase 08 (interface)

- `ImportPageCoverage` (novo, em `@ir/types`) e `ImportCandidateExtraction.pageCoverage`: cada candidato carrega um retrato da cobertura da PÁGINA inteira (não só dele), calculado uma vez por página em `composition/pdfCandidateExtraction.ts` via `checkConservation` e compartilhado por todos os candidatos daquela página.
- `ImportCandidateReview.tsx`: nova linha discreta "Cobertura da página: X%" (com selo de aviso quando <100%) + alerta de risco de perda/ordem quando há blocos órfãos ou cobertura incompleta.
- `ImportCandidateList.tsx`: indicador discreto "X% cobertura" sob o número da página, por linha.

### Script de diagnóstico — permanente, reprodutível

`packages/pdf-extraction/scripts/validate-real-pdfs.ts`: lê as 8 páginas selecionadas (lista documentada com o motivo de cada escolha), roda `extractPdf` + `checkConservation`, imprime JSON. Não é descartável — fica no repositório para reexecução em fases futuras (`npx tsx scripts/validate-real-pdfs.ts`, de dentro do pacote).

### Validação

- `packages/pdf-extraction`: 19/19 testes (`npx tsx --test test/*.test.ts`, de dentro do pacote) — os 15 já existentes (Fase 09) continuam passando após o refactor de conservação, mais 5 novos de conservação, mais 4 novos do detector de maiúsculas/minúsculas.
- `npm run typecheck --workspace @ir/sistema`: sem erros. `npm run typecheck --workspace @ir/site`: sem erros (tipos compartilhados não quebraram o portal).
- `npm run build --workspace @ir/sistema`: sucesso, 19 rotas.
- Servidor de produção local (porta verificada livre antes, processo encerrado ao final): `/importar-pdf` 200, `/materias` 200 (não afetado).
- `apps/site` e o acervo de PDFs (`apps/site/public/uploads/jornal-online/`) confirmadamente sem alterações.

### Pendências e limitações conhecidas

- Diagramação mista (Achado 4 acima) — recomendação registrada em `docs/PDF-REAL-VALIDATION.md` para uma fase futura, se o padrão se mostrar frequente no uso real.
- Nenhuma página sem camada de texto foi encontrada no acervo testado — o caminho de OCR (interface pronta desde a Fase 09, sem implementação real) permanece validado apenas por fixture sintética.
- `npm audit` continua reportando vulnerabilidades transitivas (Tiptap, desde a Fase 07); nenhuma ação nesta fase.

### Próxima fase

A decidir — possíveis caminhos: detecção de colunas por região vertical (se a diagramação mista se mostrar frequente), OCR real, ou outro módulo do Plano Mestre (editorias/localidades, publicidade, cadastro central). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 09 — extração real de PDF com fidelidade textual (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `3dfa5e4` (commit da Fase 08).
- Fase crítica. Entrega: o gerador mock de candidatos (Fase 08) foi **substituído** por leitura real de PDF — extração de texto por camada (pdfjs-dist), detecção de colunas por layout, agrupamento em parágrafos/matérias por tamanho de fonte e posição, e rastreabilidade completa até página/coluna/bloco em cada candidato. Nenhum texto é inventado, resumido ou reescrito.

### Pipeline — novo pacote isolado `@ir/pdf-extraction`

`PDF → páginas → blocos com coordenadas → agrupamento (linhas → parágrafos → matérias) → candidatos`, exportado por `extractPdf(bytes, options?)`. Módulos:

- `pdfjsNode.ts` — único ponto que faz `require("pdfjs-dist/legacy/build/pdf.js")` (build "legacy", roda em Node sem worker real) e resolve `standardFontDataUrl`/`cMapUrl` para as métricas de fonte locais do próprio pacote. **Achado importante**: sem essas métricas, pdfjs relata larguras erradas para as fontes padrão (Helvetica etc.) usadas pelo pdf-lib, distorcendo toda a extração de posição — corrigido apontando `standardFontDataUrl`/`cMapUrl` para `node_modules/pdfjs-dist/{standard_fonts,cmaps}`.
- `textLayer.ts` — abre o documento e extrai itens de texto com posição (x, linha de base) e tamanho de fonte, convertidos para espaço de página com origem no topo-esquerda.
- `columns.ts` — detecta colunas por **vãos de tinta**: um histograma de cobertura horizontal da página inteira; vãos sem nenhum texto em toda a extensão vertical viram fronteiras de coluna. Técnica de análise de layout, não de conteúdo.
- `lines.ts` — agrupa itens em linhas por proximidade vertical (dentro de uma coluna já atribuída); junta itens da mesma linha com espaço só quando há vão horizontal real entre eles.
- `paragraphs.ts` — agrupa linhas em parágrafos: duas linhas só ficam juntas quando têm o **mesmo tamanho de fonte** e o vão vertical não é maior que o normal da coluna. A mediana do "vão normal" considera apenas pares de mesmo tamanho de fonte (ver "Achados e correções" abaixo).
- `articleGroups.ts` — segmenta os parágrafos de uma coluna em candidatos a matéria (parágrafo em fonte maior que o corpo após já haver corpo acumulado, ou vão vertical muito maior que o normal) e classifica título/subtítulo/corpo pela hierarquia de tamanho de fonte. Sem hierarquia clara, mantém tudo como corpo e sinaliza baixa confiança — nunca adivinha.
- `images.ts` — conta imagens candidatas por página via `page.getOperatorList()` (operadores `paintImageXObject`/`paintImageMaskXObject` e suas variantes "Repeat"), sem extrair pixels.
- `ocr.ts` — interface `OcrProvider` + `NullOcrProvider` (padrão, sempre indisponível). Ver decisão sobre OCR abaixo.
- `warnings.ts` — sinaliza caracteres suspeitos (substituição Unicode `�`, caracteres de controle inesperados) sem tentar corrigi-los.
- `pipeline.ts` — orquestra tudo por página; decide `textLayer`/`ocr`/`unavailable` conforme a página tem ou não camada de texto e conforme o `OcrProvider` está disponível.

### Achados e correções durante a implementação (documentados para não serem re-descobertos)

1. **Texto truncado na borda direita da página**: pdfjs-dist (build legacy, sem `canvas` instalado) corta a extração de um item de texto exatamente no ponto em que ele ultrapassaria a largura da página — mesmo com a string completa presente no content stream (confirmado inspecionando o stream bruto). Isso só afeta texto que **extrapola** a página (nunca acontece em um PDF real bem diagramado, cujo texto sempre cabe dentro da margem). Testado e confirmado: instalar o pacote `canvas` **não** resolve (o comportamento é o mesmo com ou sem ele) — não é a ausência do polyfill de `DOMMatrix`/`Path2D` que causa isso. Não investigado a fundo além disso, por não afetar documentos reais; fixtures de teste foram ajustadas para larguras realistas.
2. **"Moda" por contagem de parágrafos falha com poucas amostras**: calcular o tamanho de fonte do corpo como o mais frequente **por número de parágrafos** falha exatamente no caso comum de uma página com só uma matéria (um título, um subtítulo, um corpo — empate de 1 parágrafo cada, e o desempate por ordem de inserção pegava o título). Corrigido para ponderar por **total de caracteres**: corpo de texto real sempre acumula muito mais caracteres que título/subtítulo, então esse critério é robusto mesmo com poucas amostras.
3. **Mediana "poluída" por vãos heterogêneos**: os limiares de quebra de parágrafo e de quebra de matéria, calculados a partir da mediana dos vãos observados na coluna, ficavam artificialmente altos quando a amostra misturava vãos de natureza diferente (vão título→corpo, vão entre parágrafos, vão entre matérias). Corrigido em dois lugares: (a) o vão "normal" de parágrafo agora só considera pares de linhas do **mesmo tamanho de fonte**; (b) o limiar de quebra de matéria agora é proporcional ao **tamanho da fonte do corpo** (`bodyFontSize × 3.5`), não a uma estatística dos próprios vãos — evita circularidade quando a transição entre matérias é uma das poucas amostras disponíveis.
4. **Interoperabilidade CJS/ESM inconsistente em scripts de validação ad hoc**: ao importar os mesmos arquivos de `apps/sistema` a partir de dois caminhos relativos diferentes num script de teste solto, o Node (via `tsx`) instanciou o módulo de composição **duas vezes** (dois `importCandidateService` distintos) — um artefato específico de como `apps/sistema/package.json` (sem `"type": "module"`) e `packages/pdf-extraction/package.json` (`"type": "module"`) resolvem módulos de forma diferente conforme o caminho de chamada. Não afeta o app real (Next.js/webpack usa um único grafo de módulos). Corrigido no pacote com `pdfjsNode.ts` usando `require()` explícito (não `import` ESM) para o próprio pdfjs-dist, e nos scripts de validação importando tudo por um único caminho.

### Decisão sobre OCR — não implementado nesta fase

Renderizar uma página para imagem em Node exige um canvas nativo (`canvas` ou `@napi-rs/canvas`) e um motor de OCR real (`tesseract.js`, que baixa dados de idioma em tempo de execução — risco de rede indisponível no ambiente de execução). Optou-se por **não** adicionar essas dependências nesta fase: o risco (dependência binária/nativa, download em runtime) não se justifica frente à prioridade explícita desta fase (fidelidade da camada de texto). `OcrProvider` é uma interface real e testada — uma implementação completa pode ser adicionada depois sem mudar o pipeline. Testado: `page com texto` nunca aciona OCR; `página sem texto` com um provedor fake disponível usa o resultado dele, claramente marcado como não-exato (percentual de confiança no aviso); sem provedor disponível, a página é reportada como `unavailable` com aviso explícito, nunca com texto inventado.

### Detecção de publicidade e de continuação entre colunas — heurísticas, não certezas

- **Publicidade**: um grupo de parágrafos isolado por vãos maiores que o limiar de quebra de matéria em ambos os lados, com poucos caracteres (≤ 220), é marcado `possibleAdvertisement: true` e gera aviso — nunca descartado automaticamente. Avaliada e descartada a alternativa de detectar retângulos vetoriais (bordas) via `getOperatorList()`: exigiria rastrear a matriz de transformação corrente (pilha de `save`/`restore`/`transform`) para converter coordenadas de operador em espaço de página, complexidade não justificada frente ao critério de isolamento espacial, que já cobre o caso pedido (anúncio visualmente separado do conteúdo editorial).
- **Continuação entre colunas**: o último parágrafo de um grupo sem pontuação de fechamento (`.`, `!`, `?`, aspas de fechamento) é marcado `possibleContinuation: true`. A **fusão em si não é automática** — o revisor usa a ação "Mesclar" já existente desde a Fase 08 para combinar os dois candidatos depois de ver o aviso. Decisão deliberada: detectar a separação corretamente é seguro; inferir automaticamente qual candidato futuro é a continuação certa cruzaria para "adivinhar", contra a regra principal desta fase.

### Integração com a Fase 08

- `ImportCandidateService.generateMockBatch` renomeado para `createBatch` (o método passou a ser genuinamente usado com dados reais, não só mock; nenhuma outra mudança de comportamento).
- `packages/mocks/src/editorial/import-candidate-generator.mock.ts` **removido** — o mock foi substituído, não mantido em paralelo.
- `ImportCandidate` (em `@ir/types`) ganhou `extraction?: ImportCandidateExtraction` (método, dimensões da página, blocos de origem com posição, avisos, e os três sinalizadores de confiança). Campo opcional: candidatos futuros não vindos de PDF (se algum dia existirem) simplesmente não o preenchem.
- `apps/sistema/src/composition/pdfCandidateExtraction.ts` (novo): único ponto que decide qual provider de extração usar e traduz `ArticleGroup`/`PageExtraction` (formato do pipeline) em `NewImportCandidateRecord` (formato do domínio) — corpo vira HTML (`<p>` por parágrafo, mesma convenção da Fase 07), mantendo a régua "nenhuma tela ou Server Action importa outra coisa que não os serviços já compostos".
- `GenerateCandidatesForm.tsx`: agora envia o arquivo de verdade (via `FormData`, chamada direta à Server Action — sem `<form action>` nem upload persistente) em vez de só mostrar o nome escolhido.
- `importar-pdf/actions.ts`: `generateCandidates` passou a receber `FormData`, valida que é um PDF, lê os bytes (`file.arrayBuffer()`, nunca gravados em disco) e delega à extração real; retorna contagem de candidatos, páginas e páginas sem camada de texto.
- `ImportCandidateReview.tsx`: nova seção "Comparar com a origem" mostrando o método de extração, os avisos de confiança do candidato, e um `ImportCandidateSourcePreview.tsx` novo — um SVG leve com a posição de cada bloco de origem na página (sem renderizar o PDF em si, que exigiria mantê-lo além da requisição de extração; ver limitações).
- `ImportCandidateList.tsx`: indicador "⚠ N aviso(s) de confiança" por linha, quando o candidato tiver avisos.

### Next.js — configuração necessária para pdfjs-dist em Server Action

`apps/sistema/next.config.mjs` ganhou `experimental.serverComponentsExternalPackages: ["pdfjs-dist"]`: sem isso, o webpack tenta empacotar as detecções dinâmicas de ambiente do pdfjs-dist e falha/se comporta de forma inconsistente. Com a configuração, o pacote fica como dependência externa do runtime do servidor (Node nativo cuida do `require`), exatamente como já acontece implicitamente quando se roda um script Node puro.

### Testes de fidelidade — `packages/pdf-extraction/test/` (`tsx --test`, sem framework novo)

Fixtures geradas em código via `pdf-lib` (não binários versionados) — texto de origem conhecido, comparado por igualdade exata (`assert.deepEqual`/`assert.equal`), nunca por aproximação:

| # | Fixture | O que valida | Resultado |
| --- | --- | --- | --- |
| 1 | Uma coluna (título + corpo em 2 parágrafos, com imagem embutida) | Correspondência exata de título e dos dois parágrafos; 1 coluna detectada; `imageCount === 1` (imagem não bloqueia o candidato) | ✅ exato |
| 2 | Duas colunas independentes | 2 colunas detectadas; cada matéria isolada na sua coluna; texto de uma não vaza para a outra | ✅ exato |
| 3 | Título + subtítulo + corpo | Classificação correta dos três papéis por tamanho de fonte | ✅ exato |
| 4 | Caracteres acentuados + linha fragmentada em 2 itens de texto | Acentuação preservada exatamente; junção correta de dois itens de texto em uma linha (espaço nem perdido nem duplicado); zero avisos de caractere suspeito para texto legítimo | ✅ exato |
| 5 | Bloco isolado entre duas matérias (publicidade) | 3 grupos distintos; texto do bloco isolado não aparece em nenhuma das matérias vizinhas; `possibleAdvertisement: true` só no bloco isolado | ✅ exato + sinalização correta |
| 6 | Matéria continuando em outra coluna | 2 candidatos separados (nenhuma fusão automática); `possibleContinuation: true` na coluna 1; texto das duas colunas, concatenado, reconstitui a frase original exatamente (nada perdido/duplicado na fronteira) | ✅ exato + sinalização correta |
| 7 | Página sem camada de texto | Sem OCR disponível: `method: "unavailable"`, zero candidatos, aviso explícito (não inventa texto); com um `OcrProvider` fake disponível: usa o resultado, marcado como baixa confiança, aviso cita o percentual — nunca tratado como exato | ✅ comportamento correto (não aplicável "exatidão" para OCR, conforme pedido) |

10/10 testes (`npx tsx --test test/extraction.test.ts test/pipeline.test.ts`, executados de dentro de `packages/pdf-extraction`).

**Testes que o conjunto acima detectaria** (conforme pedido): palavra perdida ou duplicada → comparação exata de string falha; troca de ordem → comparação exata de string (ordem faz parte do conteúdo) falha; parágrafo misturado → teste 5/6 falhariam (texto cruzando fronteiras); caractere alterado → comparação exata de string falha, e o teste 4 adicionalmente falharia se `�`/controle aparecessem.

### Validação de integração (camada de composição real, não só o pacote isolado)

Script `tsx` temporário (removido ao final, nunca commitado) gerou um PDF real via `pdf-lib`, chamou `extractCandidatesFromPdf` (a mesma função que a Server Action chama) contra a composição real de `apps/sistema`, e seguiu o fluxo completo — **16/16 asserções**: extração real gera candidato correto (título/corpo com acentos, exatos); vínculo `editionId`/`pageNumber` preservado; candidato nasce `pending` com `extraction` presente e `method: "textLayer"`; revisão manual (`keep`) funciona sobre candidato real; conversão sempre gera rascunho (`status: "draft"`), preserva título e vínculo edição/página; matéria aparece em `ArticleService.list()`.

### Validação de renderização real

`npm run typecheck`/`build --workspace @ir/sistema`: sem erros; 19 rotas, `/importar-pdf` e `/importar-pdf/[candidateId]` dinâmicas. `npm run typecheck --workspace @ir/site`: sem erros (tipos compartilhados não quebraram o portal). Servidor de produção local (porta verificada livre antes, processo encerrado ao final): `/importar-pdf` 200, `/importar-pdf?edicao=edition-2026-038` 200, `/importar-pdf/nao-existe` 404, `/materias` 200 (não afetado). `apps/site` confirmadamente sem alterações.

### Pendências e limitações conhecidas

- **Sem OCR real** — interface pronta, decisão de não implementar motor real documentada acima. Revisitar quando houver clareza sobre disponibilidade de rede em produção para baixar dados de idioma, ou disposição para depender de um binário nativo.
- **Sem renderização visual do PDF na revisão** — o preview mostra as posições dos blocos (SVG), não a página em si; renderizar a página exigiria manter o arquivo além da requisição de extração (o PDF é hoje inteiramente transitório, nunca persistido), o que cruzaria para "storage", fora do escopo desta fase.
- **Extração de imagens é só contagem** — sem bbox nem associação por bloco; extrair a posição exigiria rastrear a matriz de transformação corrente do operador list (não implementado, avaliado como não essencial frente à fidelidade textual).
- **Heurísticas de publicidade/continuação são sinalizadores, não certezas** — sempre revisáveis pelo humano, nunca decidem sozinhas.
- **`npm audit` continua reportando vulnerabilidades transitivas** (Tiptap desde a Fase 07); nenhuma ação nesta fase, consistente com "não atualizar stack sem necessidade".

### Próxima fase

A decidir — possíveis caminhos: OCR real (se/quando a infraestrutura permitir), extração de imagens com posição, ou avanço para outro módulo do Plano Mestre (cadastro de editorias/localidades, publicidade, cadastro central). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 08 — importação de PDF / revisão de candidatos (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `817c386` (commit da Fase 07).
- Entrega: fluxo completo de importação simulada — selecionar edição, simular seleção de PDF, gerar candidatos mock, revisar (manter/descartar/editar/mesclar/dividir) e converter em rascunho real via `ArticleService`. Nenhum parser/OCR real; `apps/site` não foi tocado.

### `packages/types`

`ImportCandidate` ganhou `suggestedLocalityId?`, `mergedIntoId?` (referência de rastreabilidade quando descartado por mesclagem — nunca apagamos o registro) e `createdAt`. Nenhuma mudança nos demais tipos.

### `packages/core` — dois serviços novos, simétricos aos existentes

- `NewspaperEditionRepository`/`NewspaperEditionService` (somente leitura) — necessário para listar edições existentes na tela sem importar `@ir/mocks` diretamente.
- `ImportCandidateRepository` (`list`/`getById`/`create`/`createMany`/`update`) e `ImportCandidateService`, que depende do `ArticleService` já existente (mesmo padrão de composição entre serviços já usado por `ArticleService` com `EditorialSectionRepository`/`LocalityRepository`):
  - `generateMockBatch` — recebe os registros já prontos (a decisão de COMO gerá-los é do provider/composição, não do core).
  - `keep` — salva os ajustes da revisão, candidato continua `pending`.
  - `discard` — status `discarded`; nunca cria matéria.
  - `merge(primaryId, secondaryIds)` — concatena corpo/mídia sugeridos dos secundários no principal; secundários viram `discarded` com `mergedIntoId` (sem exclusão destrutiva, rastreável).
  - `split(id)` — divide o corpo em dois candidatos. Sem parser real: corta em blocos HTML de nível superior (`</p>`, `</h3>`, `</blockquote>`, `</ul>`, `</ol>`) e reparte pela metade; sem blocos identificáveis (texto puro), reparte a string pela metade dos caracteres. A soma das duas partes reconstitui o corpo original.
  - `convertToDraft` — sempre chama `articleService.importAsDraft` (força `status: "draft"`); rejeita quando não há editoria (nem sugerida, nem escolhida na revisão) ou localidade, preservando a regra "toda matéria tem editoria" também para conteúdo importado. Mantém `editionId`/`editionPageNumber` (o segundo pode ser corrigido na revisão antes de converter).
- `ArticleService` **não foi alterado nesta fase**.

### `packages/mocks`

- 2 edições adicionais em `newspaperEditions` (037 e 039, além da 038 já existente) — só para a seleção de edição na tela ter sentido real.
- `createImportCandidateRepositoryMock` — começa **vazio** de propósito: o fluxo descrito (selecionar edição → selecionar PDF → gerar candidatos) só faz sentido se não houver nada pré-carregado.
- `createNewspaperEditionRepositoryMock`.
- `generateMockImportCandidates(editionId)` — lote fixo de 4 candidatos plausíveis: um sem editoria/localidade sugeridas (publicidade disfarçada de matéria, para demonstrar o descarte), um com dois parágrafos (para demonstrar a divisão), e dois candidatos comuns de política/esporte.

### `apps/sistema`

- `composition/editorial.ts`: `newspaperEditionService`, `importCandidateService` e `generateCandidatesForEdition(editionId)` — esta última é o único lugar do app que decide *qual* gerador mock usar, mantendo `@ir/mocks` fora de páginas e Server Actions.
- `lib/simulatedAudit.ts`: constante `SIMULATED_AUDIT` extraída de `materias/actions.ts` (pequena limpeza, mesma identidade simulada reaproveitada pelas novas Server Actions).
- `app/sistema/editorial/importar-pdf/page.tsx` — Server Component; edição selecionada via `searchParams.edicao` (formulário GET nativo, sem JS) para não obrigar client state só para navegar entre edições. Sem edição selecionada: só o seletor. Com edição e sem candidatos: `GenerateCandidatesForm`. Com candidatos: `ImportCandidateList` (e um `<details>` para gerar um novo lote sem perder o que já existe).
- `app/sistema/editorial/importar-pdf/actions.ts` — `generateCandidates`, `discardCandidate`, `mergeCandidates`, `splitCandidate`, `keepCandidate`, `convertCandidate`. **Diferença deliberada do padrão das Fases 06/07**: nenhuma dessas ações chama `redirect()` internamente — todas retornam `{ error }` ou um resultado (`{ ok: true, articleId }`, etc.) e quem decide navegar é o componente cliente que a chamou, porque as mesmas ações são usadas tanto na lista (ação rápida, permanece na mesma página) quanto na revisão detalhada (navega para a lista ou para a matéria criada). Documentado aqui para não ser confundido com inconsistência.
- `app/sistema/editorial/importar-pdf/[candidateId]/page.tsx` — Server Component; converte `ImportCandidateNotFoundError` em `notFound()`, mesmo padrão das Fases 05/06.
- `features/editorial/GenerateCandidatesForm.tsx` — `<input type="file" accept="application/pdf">` cujo único efeito é mostrar o nome do arquivo escolhido; nada é lido ou enviado. O botão "Gerar candidatos" é o que de fato aciona a Server Action mock.
- `features/editorial/ImportCandidateList.tsx` — tabela densa (mesmo padrão visual de `MateriasList`, sem cards): checkbox por candidato pendente para seleção múltipla, "Mesclar selecionados", e por linha: Abrir, Converter, Descartar (ou "Ver rascunho" quando já convertido; nota "Mesclado em: …" quando descartado por mesclagem).
- `features/editorial/ImportCandidateReview.tsx` — reaproveita integralmente `ArticleBodyEditor` (Fase 07) para o corpo e `ArticleMediaPicker` (Fase 06) para capa/galeria, inicializado a partir de `suggestedMediaAssetIds` via novo helper `suggestedIdsToArticleMedia`. Campos: título, subtítulo, corpo, editoria, localidade, página da edição; mostra também uma fileira somente-leitura "Sugeridas pela importação" com as imagens que o (simulado) processamento indicou, distinta da seleção final ajustável. Ações: Manter, Converter em rascunho, Dividir candidato, Descartar — as duas últimas navegam de volta à lista da edição; converter navega para a matéria recém-criada.
- `EditorialOverview.tsx`: novo link "Importar do jornal impresso" ao lado de "Ver matérias".

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 19 rotas; `/importar-pdf` e `/importar-pdf/[candidateId]` dinâmicas (a segunda com ~207 kB de First Load JS, por reaproveitar o editor Tiptap da Fase 07).
- Validação de negócio (script `tsx` temporário, removido ao final, nunca commitado), reproduzindo os mesmos serviços da composição real — **32/32 asserções**, cobrindo exatamente os pontos pedidos: geração do lote mock (4 candidatos, todos pendentes, na edição certa); candidato de publicidade sem editoria sugerida presente no lote; **descartar** (status `discarded`, nunca ganha `createdArticleId`, nenhuma matéria criada); **converter** (sempre `draft`, `origin: "pdfImport"`, vínculo `editionId`/`editionPageNumber` preservado, editoria sugerida usada quando não sobrescrita, candidato muda para `converted` com `createdArticleId`); conversão sem editoria (nem sugerida nem escolhida) rejeitada; **mesclar** (corpo combinado, secundário descartado com `mergedIntoId`, nunca apagado); **dividir** (duas partes pendentes, vínculo edição/página preservado na segunda parte, soma das partes reconstitui o corpo original); página vinculada corrigida manualmente na revisão é a que vale na conversão final.
- Validação de renderização real (`next start`, porta 3001, processo verificado livre antes de iniciar e encerrado ao final): `/importar-pdf` sem edição 200; `/importar-pdf?edicao=edition-2026-038` 200, com as 3 edições listadas no seletor e mensagem correta de "nenhum candidato ainda"; `/importar-pdf/nao-existe` 404; nenhum "Hydration failed" ou erro de aplicação.
- **Limite desta validação**: como nas Fases 06/07, sem ferramenta de automação de navegador nesta sessão — os cliques de mesclar/dividir/converter na interface não foram exercidos em um browser de verdade, apenas a lógica de negócio (script acima) e a renderização inicial via SSR. Recomenda-se um teste manual rápido no navegador.
- Não alterado: `apps/site` (flipbook, leitor, Google Drive, acervo preservados), IndexedDB legado, anúncios/patrocinadores, `ArticleService`.

### Pendências e decisões

- Mesclagem concatena corpo/mídia de forma simples (sem interface de "escolher qual título prevalece" além do que já está no candidato principal); dividir usa um corte automático pela metade dos blocos HTML, não um ponto escolhido manualmente pelo revisor — ambos suficientes para demonstrar o fluxo mock, mas não são heurísticas sofisticadas (não é o objetivo desta fase).
- `NewspaperEditionService`/`NewspaperEditionRepository` são somente leitura; cadastro de novas edições continua fora de escopo.
- Sem aviso de alterações não salvas na tela de revisão do candidato (diferente do `ArticleForm` na Fase 07) — não pedido nesta fase, mantido fora para não expandir o escopo.

### Próxima fase

A decidir — possíveis caminhos: cadastro de editorias/localidades (`/sistema/editorial/editorias`, `/localidades`), tela de mídias (`/sistema/editorial/midias`), ou avanço para outro módulo do Plano Mestre (cadastro central, publicidade). Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 07 — editor editorial de texto (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d5f3b29` (commit da Fase 06).
- Entrega: título/subtítulo ganham controle discreto de formatação; o corpo passa a usar um editor de texto funcional (Tiptap/ProseMirror) no lugar do textarea simples; aviso de alterações não salvas ao sair da edição.

### Título e subtítulo — controle discreto, não um editor livre

- Novo tipo `EditorialTextStyle` (`bold`, `italic`, `size: "default"|"large"|"xlarge"`, `emphasis: "normal"|"medium"|"strong"`) em `packages/types/src/editorial/index.ts`, com `Article.titleStyle?`/`Article.subtitleStyle?` opcionais. Título e subtítulo continuam campos de texto simples (`string`); o estilo é metadado separado, nunca marcação dentro da string — evita que a listagem (Fase 05) ou qualquer outro consumidor de `article.title` passe a exibir HTML literal.
- `TextStyleControl.tsx`: um `<details>`/`<summary>` nativo ("Aa") ao lado do rótulo do campo, com dois toggles (negrito/itálico) e dois selects (tamanho, peso/ênfase) — sem fonte livre, sem cor livre, exatamente as opções limitadas do Plano Mestre (Parte C, item 7).
- `textStyle.ts`: `DEFAULT_TEXT_STYLE`, `textStyleToCss` (converte o estilo em `CSSProperties` aplicado inline no `<input>`, com tamanhos em px distintos para título/subtítulo) e `isDefaultTextStyle` — usada pelas Server Actions para não persistir o estilo quando é igual ao padrão, mantendo os dados enxutos e as matérias antigas (sem esse campo) visualmente equivalentes.
- **Correção necessária**: as regras `.field-title-input`/`.field-subtitle-input` em `globals.css` usavam `font-size: ... !important`, que bloquearia qualquer `style` inline (CSS `!important` de folha de estilos vence estilo inline). Removido — o estilo inline agora controla peso/itálico/tamanho, a classe cuida apenas de fonte/cor base.

### Corpo — editor funcional leve

- Novas dependências em `apps/sistema/package.json`: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-text-align` (resolvidas em `2.27.3`). Tiptap é headless (sem UI própria), por isso a barra de ferramentas em `ArticleBodyEditor.tsx` é inteiramente nossa, no mesmo padrão visual do shell (sem Tailwind, sem biblioteca de UI pronta).
- Recursos habilitados, exatamente os pedidos — negrito, itálico, subtítulo interno (heading nível 3, único nível liberado), listas com marcadores e numeradas, link (com prompt para URL, sem abrir ao clicar durante a edição), citação, alinhamento esquerda/centro/justificado, desfazer/refazer. `strike`, `code`, `codeBlock` e `horizontalRule` do `StarterKit` foram explicitamente desativados para não abrir formatação além do escopo pedido.
- `Article.body` continua `string` — agora HTML gerado pelo editor (`editor.getHTML()`). Nenhuma mudança de tipo; compatível com o contrato de importação de PDF já existente (`ImportCandidate.suggestedBody?: string`).
- `immediatelyRender: false` no `useEditor` evita divergência entre o HTML renderizado no servidor e no cliente (armadilha documentada do Tiptap com Next.js App Router); a área do corpo mostra "Carregando editor…" até a hidratação — confirmado via HTML de produção (sem "Hydration failed" nem erro de aplicação).
- Conteúdo mock antigo (texto puro, sem tags) continua abrindo normalmente: o parser HTML do ProseMirror envolve texto solto em um parágrafo padrão: comportamento documentado da biblioteca, confirmado na validação de negócio abaixo.

### `packages/core` — extensão mínima (sem alterar regras)

- `CreateArticleInput` (em `article-service.ts`) ganhou `titleStyle?`/`subtitleStyle?` opcionais, repassados para o registro criado por `saveDraft`. Nenhum outro método do `ArticleService` foi alterado — `updateDraft` já aceitava esses campos de forma genérica (`ArticleChanges = Partial<Omit<Article, ...>>`), sem precisar de código novo.

### UX — aviso de alterações não salvas

- `ArticleForm.tsx`: snapshot dos valores iniciais calculado uma vez (`useState` com inicializador lazy) comparado a cada render para derivar `isDirty`. Um listener de `beforeunload` bloqueia fechar a aba/atualizar quando há alterações não salvas.
- O link "Voltar à listagem" saiu do `ModuleHeader` das páginas (que não têm acesso ao estado do formulário) e virou um botão dentro do próprio `ArticleForm`, que confirma com o usuário antes de navegar quando há alterações pendentes.
- Escopo conhecido e documentado: a navegação pela barra lateral (`AdminSidebar`) não é interceptada — exigiria um contexto global de "formulário sujo" ou um guard de rota, fora do escopo desta fase. `beforeunload` também não cobre o botão "voltar" do navegador em navegação client-side do App Router (não dispara evento de unload real).

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/materias/nova` e `/materias/[id]` cresceram de ~100 kB para ~198 kB de First Load JS (bundle do Tiptap/ProseMirror, esperado para um editor rico).
- Validação de negócio (script `tsx` temporário, removido ao final, nunca commitado), reproduzindo os mesmos serviços da composição real — 14/14 asserções: corpo HTML (negrito/itálico/lista/link/citação/alinhamento) salvo e recuperado sem alteração; estilo de título/subtítulo persistido corretamente; reabrir preserva corpo e estilo; editar sobrescreve o corpo mantendo o restante; publicar preserva corpo/estilo; matéria mock antiga (`article-1243`, texto puro) continua com o corpo intacto e sem `titleStyle`; edição continua obrigatória.
- Validação de renderização real (`next start`, porta 3001, processo encerrado ao final): `/materias/nova`, `/materias/article-1245` (com conteúdo pré-existente) e `/materias/article-1243` (corpo em texto puro) retornam 200; `/materias/nao-existe` 404; nenhum "Hydration failed" ou "Application error" no HTML; título pré-preenchido corretamente; barra de ferramentas do editor (8 botões com `aria-label`) presente na resposta do servidor; placeholder "Carregando editor…" presente (confirma `immediatelyRender: false` funcionando); botão "Voltar à listagem" e os dois controles "Aa" (título/subtítulo) presentes uma única vez cada, como esperado.
- **Limite desta validação**: sem ferramenta de automação de navegador disponível nesta sessão (verificado: playwright/puppeteer não instalados), a interação real da barra de ferramentas do editor (cliques, atalhos, diálogo de confirmação ao sair) não foi exercida em um browser de verdade — apenas por leitura de código, pela renderização SSR acima e pela validação de negócio na camada de serviço. Recomenda-se um teste manual rápido no navegador antes de considerar a fase definitivamente encerrada para uso real da redação.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- `npm install` reportou vulnerabilidades de auditoria na nova árvore de dependências do Tiptap (transitivas); nenhum `npm audit fix` foi executado nesta fase — decisão consistente com "não atualizar stack sem necessidade" das fases anteriores. Revisar oportunamente.
- Sem confirmação de saída para navegação pela barra lateral (ver UX acima) — limite documentado, não implementado.
- Título/subtítulo ainda não suportam fonte livre (fora do pedido: "fonte entre opções autorizadas" do Plano Mestre menciona fonte, mas a Fase 07 não pediu esse controle explicitamente; não implementado para não expandir além do solicitado).

### Próxima fase

Importação de PDF (candidatos, revisão, mesclar/dividir, vínculo com edição) — a estrutura de `ImportCandidate` e `Article.body`/`titleStyle` já é compatível. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 06 — cadastro e edição de matéria (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d70d867` (commit da Fase 05).
- Entrega: `/sistema/editorial/materias/nova` e `/sistema/editorial/materias/[id]` passam a ser um formulário real, usando `ArticleService` por Server Actions. Nenhuma página importa `@ir/mocks` diretamente.

### Por que Server Actions

O domínio editorial é mock em memória, sem banco. Se o formulário (client
component) chamasse `ArticleService` diretamente pelo navegador, o
`composition/editorial.ts` seria avaliado uma vez no bundle do servidor (usado
pelas páginas) e outra vez no bundle do navegador (usado pelo formulário),
criando dois estados divergentes do mesmo "banco" mock. Server Actions
(`"use server"`) executam no mesmo processo Node dos Server Components, então
`actions.ts` chama `articleService` diretamente e mantém um único estado
consistente — a listagem criada na Fase 05 reflete imediatamente o que o
formulário grava.

### `packages/core` e `packages/mocks` — extensão mínima

- Novo `MediaAssetRepository`/`MediaAssetService` (somente `list`/`getById`, sem criação/upload) em `packages/core/src/editorial/`, simétrico aos repositórios de editoria/localidade já existentes. Necessário para a biblioteca de mídia do formulário sem importar `mediaAssets` de `@ir/mocks` diretamente na página.
- Novo `createMediaAssetRepositoryMock` em `packages/mocks/src/editorial/`, reaproveitando os `mediaAssets` já cadastrados na Fase 04.
- `ArticleService` **não foi alterado** — toda a composição de ações (criar como programada, reverter para rascunho, etc.) acontece na camada de Server Action, reaproveitando `saveDraft`/`updateDraft`/`publishNow`/`schedule`/`archive` como já existiam.
- `composition/editorial.ts` ganhou `mediaAssetService`.

### `apps/sistema` — novos arquivos

- `app/sistema/editorial/materias/actions.ts` (`"use server"`): `createArticle`, `updateArticle`, `archiveArticle`. Validam (`validateArticlePayload`, compartilhada com o formulário), chamam os métodos do `ArticleService`, revalidam a listagem e o detalhe (`revalidatePath`) e redirecionam para `/sistema/editorial/materias/[id]` ao final. Identidade simulada fixa (`editor-sistema` / `editorial`), sem autenticação real.
- `features/editorial/ArticleForm.tsx` (client component): usado em criação e edição. Seções: Identificação (título/subtítulo com aparência editorial, referência interna somente leitura), Conteúdo, Classificação (editoria obrigatória, localidade), Exposição editorial (posição/destaque com janela opcional — não altera a editoria), Publicação (status atual informativo + data/hora de programação). Ações: Salvar rascunho, Publicar agora, Programar e, somente em edição, Arquivar (com confirmação).
- `features/editorial/ArticleBodyEditor.tsx`: textarea isolada em componente próprio — seam preparado para um editor rico futuro sem alterar o restante do formulário.
- `features/editorial/ArticleMediaPicker.tsx`: capa (com remoção), galeria ordenável (mover para cima/baixo, remover) e biblioteca de mídia mock com "Definir como capa"/"Adicionar à galeria". Sem upload — apenas seleção do catálogo existente.
- `features/editorial/articleMediaState.ts`: funções puras (`setCoverMedia`, `removeCoverMedia`, `addGalleryMedia`, `removeGalleryMedia`, `moveGalleryMedia`) que mantêm no máximo uma capa e reindexam a ordem da galeria a cada mudança.
- `features/editorial/articleFormTypes.ts`: `ArticleFormPayload`, `ArticleFormIntent` e `validateArticlePayload` — compartilhados entre o formulário (feedback imediato) e a Server Action (defesa em profundidade).
- `lib/datetimeLocal.ts`: conversão entre ISO e o formato de `<input type="datetime-local">`.
- `materias/nova/page.tsx` e `materias/[id]/page.tsx` reescritas: buscam editorias/localidades/mídias via composição e renderizam `ArticleForm` (`mode="create"` ou `mode="edit"`); `[id]` converte `ArticleNotFoundError` em `notFound()`, como na Fase 05.
- CSS novo em `globals.css` para o formulário e o seletor de mídia (`.article-form`, `.form-section`, `.field-title-input`/`.field-subtitle-input` com tipografia editorial, `.form-actions`, `.media-picker`, `.gallery-list`, `.library-grid`), mesma linguagem visual do shell, sem Tailwind e sem biblioteca de UI nova.

### Regras aplicadas na composição das ações

- "Salvar rascunho" sempre define `status: "draft"` e limpa `publishedAt`/`scheduledAt` — mesmo a partir de uma matéria publicada, garantindo que rascunho nunca publica.
- "Publicar agora" e "Programar" persistem primeiro os campos editados (`updateDraft`) e só então chamam `publishNow`/`schedule`; ao criar uma matéria já publicando/programando, `saveDraft` roda primeiro (sempre como rascunho, por contrato do `ArticleService`) e a transição de status é a chamada seguinte — nunca pulando o rascunho intermediário.
- "Programar" sem data/hora é rejeitado antes de chamar o service (client e Server Action).
- Destaque (`placement`) nunca inclui `sectionId` — a UI nem oferece esse campo dentro da seção de exposição editorial.
- "Arquivar" só aparece quando `mode === "edit"`.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/materias/nova` e `/materias/[id]` cresceram (Server Actions incluídas no bundle) mas sem erros.
- Validação de negócio (não apenas compilação): script `tsx` temporário (removido ao final, nunca commitado) compôs `ArticleService`/`EditorialSectionService`/`LocalityService` com os mesmos mocks da composição real e exercitou, com asserções, os 19 comportamentos-chave: criação sempre como rascunho, referência gerada automaticamente, edição altera campos, capa exclusiva, galeria mantém ordenação, destaque não altera editoria, publicar agora grava `publishedAt`, salvar rascunho reverte status e limpa datas, programar exige e grava `scheduledAt`, arquivar define `archived`, criação direta como programada (create+schedule), e rejeição de editoria inexistente. Todas as 19 asserções passaram.
- Validação de renderização real: servidor de produção local (`next start`, porta 3001) — `/materias/nova` 200 com os 9 itens da biblioteca de mídia listados; `/materias/article-1245` (publicada, com galeria) 200 com capa e as 2 imagens de galeria corretas, seletor de destaque pré-selecionado em "mainHighlight", status "Publicada"; `/materias/article-1243` (rascunho sem imagem) 200 com os estados vazios corretos ("Nenhuma capa selecionada", "Nenhuma imagem na galeria"); `/materias/nao-existe` 404. Servidor encerrado ao final.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- Corpo da matéria é uma textarea simples (isolada em `ArticleBodyEditor` para facilitar a troca futura por um editor rico); título/subtítulo têm aparência editorial (Georgia serif) mas sem controles de formatação pontual ainda.
- Sem upload real: a galeria/capa só pode usar as 9 mídias mock já cadastradas na Fase 04.
- Sem confirmação de saída ao navegar para fora do formulário com alterações não salvas — não solicitado nesta fase.
- Identidade/ator continua simulada (`editor-sistema`); nenhuma auditoria é persistida (consistente com a decisão da Fase 04).

### Próxima fase

Importação de PDF (candidatos, revisão, mesclar/dividir, vínculo com edição) **ou** evolução do editor de texto (formatação básica: negrito, itálico, listas, links, citações) — a decidir. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 05 — lista de matérias (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `41d58151c587e980497f752ecd72772c1ccb9d1e` (commit da Fase 04).
- Entrega: primeira tela real do CMS, ligando a UI ao domínio editorial composto na Fase 04. Sem editor completo.

### Rotas criadas

- `apps/sistema/src/app/sistema/editorial/materias/page.tsx` — Server Component assíncrono; busca `articleService.list()`, `editorialSectionService.list()` e `localityService.list()` via `composition/editorial.ts` (nenhuma fixture de `@ir/mocks` importada na página) e renderiza `ModuleHeader` + `MateriasList`.
- `apps/sistema/src/app/sistema/editorial/materias/[id]/page.tsx` — detalhe somente leitura; usa `articleService.getById`, converte `ArticleNotFoundError` em `notFound()`. Mostra referência, editoria, localidade, status, destaque, notificação, mídia, origem, datas e responsável. Cobre as ações "Abrir" e "visualizar estado" sem ser um editor.
- `apps/sistema/src/app/sistema/editorial/materias/nova/page.tsx` — stub da ação "Nova matéria", reaproveitando `EmptyModuleState` para deixar claro que o formulário completo é uma etapa futura.

### Componentes e suporte

- `apps/sistema/src/features/editorial/MateriasList.tsx` (client component) — filtros de busca por texto (título/subtítulo/referência), status, editoria e localidade, aplicados sobre a lista já carregada pelo Server Component (sem chamar os services novamente a cada filtro). Tabela densa (sem cards) com referência, matéria, editoria, localidade, status, publicação/programação, destaque, notificação, indicação de imagem/capa e ação "Abrir".
- `apps/sistema/src/features/editorial/editorialLabels.ts` — mapas de rótulo em português para `ArticleStatus`, `EditorialPlacementType` e `NotificationMode`, e helpers de formatação de data/mídia. Fica na camada de UI, não em `packages/types` ou `packages/core`.
- `EditorialOverview.tsx` atualizado: aviso não fala mais em "próxima etapa" para a listagem (que já existe) e ganhou o link "Ver matérias" para `/sistema/editorial/materias`.
- `globals.css`: novo bloco de estilos próprios do shell (toolbar de filtros, tabela, `status-pill`/`placement-pill`/`notification-pill`, indicador de mídia, layout de detalhe com `meta-list`, `header-action`), sem Tailwind e sem `@ir/ui` — mantém a mesma linguagem visual (papel claro/verde escuro/tipografia editorial) das telas da Fase 03.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/sistema/editorial/materias` e `/sistema/editorial/materias/nova` pré-renderizadas como estáticas, `/sistema/editorial/materias/[id]` como dinâmica.
- Servidor de produção iniciado localmente (`next start`, porta 3001) só para validação e encerrado ao final: `/sistema/editorial/materias` → 200 com as 7 referências mock (`IR-MAT-2026-001240`…`001246`) e contagem de status batendo com os fixtures (2 rascunho, 1 em ajuste, 1 programada, 3 publicadas); `/sistema/editorial/materias/article-1241` → 200, mostrando corretamente "Urgente" e "Notificação urgente"; `/sistema/editorial/materias/nao-existe` → 404 (via `notFound()`); `/sistema/editorial/materias/nova` → 200.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- "Abrir" leva a uma visualização somente leitura do estado da matéria, não a um editor; "Nova matéria" leva a um stub explicando que o cadastro completo é uma etapa futura — ambos evitam sugerir uma funcionalidade que não existe ainda.
- Filtros são client-side sobre a lista completa já carregada (adequado ao volume de dados mock atual); quando houver paginação/backend real, a filtragem deve migrar para os repositórios/serviços.
- Nenhuma alteração em `packages/types`, `packages/core` ou `packages/mocks` nesta fase — a fase foi puramente de consumo da composição já existente.

### Próxima fase

Lote 2 (continuação) — cadastro/edição de matéria usando `articleService.saveDraft/updateDraft/publishNow/schedule`, escolha de capa/galeria, padrão editorial de título/subtítulo/texto, destaque e notificação. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 04 — domínio editorial (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `2bf8a7e272a6f9aa0797261f635ee07f309357f8` (nenhum commit próprio da branch existia ainda; Fases 1–3 estavam integralmente pendentes de commit).
- Entrega: fundação de domínio editorial sem banco real, sem autenticação e sem ampliar o frontend.

### `packages/types`

Novo módulo `src/editorial/` (reexportado em `src/index.ts`, tipos legados preservados sem alteração): `UserRole`, `ArticleStatus`, `NotificationMode`, `LocalityScope`, `Locality`, `EditorialSection`, `EditorialPlacementType`, `EditorialPlacement`, `MediaAsset`, `ArticleMediaRole`, `ArticleMedia`, `ArticleOrigin`, `Article`, `NewspaperEdition`, contratos mínimos de importação de PDF (`ImportCandidateStatus`, `ImportCandidate`) e contexto de auditoria (`AuditContext`, `AuditEvent`).

Regras aplicadas: `Article.sectionId` é obrigatório; `Article.localityId` é obrigatório e independente da editoria (uma localidade com `scope: "general"` representa "Região"); `subtitle` e mídia são opcionais; `ArticleMedia.role` distingue `cover` de `gallery`, com `order` para reordenação; `placement` nunca substitui `sectionId`; `origin: "pdfImport"` só é usado por fluxos que sempre resultam em `status: "draft"`.

### `packages/core`

Novo pacote `@ir/core` (dependência: `@ir/types`), com `src/editorial/`:

- `ArticleRepository`, `EditorialSectionRepository`, `LocalityRepository` — contratos puros, sem React/IndexedDB/Supabase.
- `ArticleService` — `list`, `getById`, `saveDraft`, `updateDraft`, `publishNow`, `schedule`, `archive`, `importAsDraft`; valida existência de editoria/localidade antes de gravar; publicação e programação são sempre chamadas explícitas; todo método recebe `AuditContext` (não persistido nesta fase — apenas para não inviabilizar auditoria futura).
- `EditorialSectionService`, `LocalityService` — `list`/`getById` simples.

Fluxo respeitado: `UI → Service → Repository → Provider`.

### `packages/mocks`

Novo módulo `src/editorial/` (reexportado em `src/index.ts`; dados legados de notícias/patrocinadores/anúncios preservados). `data.ts` traz 5 editorias, 4 localidades, 8 mídias, 1 edição impressa e 7 matérias cobrindo: publicada (com manchete e com destaque principal), programada, rascunho, em ajuste, com e sem imagem, galeria (múltiplas imagens com capa definida), diferentes editorias e localidades, urgente e matéria importada de PDF vinculada a uma edição (`editionId` + `editionPageNumber`).

`article-repository.mock.ts`, `editorial-section-repository.mock.ts` e `locality-repository.mock.ts` exportam fábricas (`createXRepositoryMock`) que implementam os contratos de `@ir/core` sobre cópias em memória dos dados acima; o estado dura apenas a instância criada, sem persistência real.

### `apps/sistema`

Novo `src/composition/editorial.ts`: ponto de composição único ligando `MockRepository → Service` (`articleService`, `editorialSectionService`, `localityService`). Não é consumido por nenhuma tela nesta fase — nenhuma UI nova foi criada, conforme escopo da Fase 04.

Adicionado `@ir/core` às dependências de `apps/sistema/package.json` e a `transpilePackages` de `apps/sistema/next.config.mjs`. Adicionado o path `@ir/core` em `tsconfig.base.json`. Rodado `npm install` na raiz para registrar o novo workspace (symlink em `node_modules/@ir/core` e entrada em `package-lock.json`).

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 16 rotas geradas (inclui `/sistema/editorial` e módulos placeholder).
- `npm run typecheck --workspace @ir/site`: sem erros — confirma que os novos tipos/pacotes compartilhados não quebraram o portal, o IndexedDB atual, o flipbook nem o jornal digital.
- Nenhum teste funcional em navegador nesta fase (não há UI nova consumindo o domínio editorial ainda).

### Pendências e decisões

- `packages/mocks` e `packages/core` passaram a declarar `dependencies` explícitas para os pacotes `@ir/*` que efetivamente usam (`packages/types`, `packages/config` e `packages/ui` legados não declaravam essas dependências entre si; a resolução funcionava apenas via symlink de workspace). Convenção não retroaplicada aos pacotes antigos nesta fase.
- O commit desta fase também inclui documentação do Lote 1 (Partes A–T do Plano Mestre, `ARCHITECTURE.md`, `FRONTEND-STRUCTURE.md`, `DATA-BOUNDARIES.md`, `CURRENT-STATE.md`, scripts 01/02) e o shell administrativo da Fase 03, pois nenhuma dessas fases tinha sido commitada até agora nesta branch. `HEAD` da branch, portanto, salta diretamente de `main` para o commit consolidado desta rodada.
- Rotas `/sistema/editorial/materias`, `/programacao`, `/importar-pdf`, `/editorias`, `/localidades`, `/midias` continuam não implementadas — previstas para o próximo lote (CMS completo), que consumirá `articleService`/`editorialSectionService`/`localityService` do ponto de composição criado aqui.
- Como no domínio ainda não há telas, o comportamento observável do sistema não mudou nesta fase; a entrega é estrutural.

### Próxima fase

Lote 2 — CMS editorial completo: telas de listagem/filtro de matérias, cadastro/edição usando os serviços já compostos, escolha de capa/galeria, programação, destaque e notificação. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 03 — shell administrativo (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- SHA base: `2bf8a7e272a6f9aa0797261f635ee07f309357f8`.
- Entrega: layout administrativo persistente, menu completo, navegação ativa, cabeçalho, Início, apresentação Editorial e páginas explícitas de módulos planejados.
- Linguagem visual: papel claro, verde escuro, tipografia de leitura com títulos editoriais, divisores e listas. Sem métricas fictícias, dependência de fontes remotas ou biblioteca de UI nova.
- Componentes locais em `apps/sistema/src/components/admin`; conteúdo editorial em `features/editorial`; mapa tipado de módulos em `lib/navigation.ts`.
- Menu móvel usa `dialog` nativo, fechamento por Escape, navegação ou botão e gerenciamento nativo de foco; há link para pular ao conteúdo e foco visível.
- Rotas antigas de anúncios/patrocinadores continuam com suas operações em memória, agora dentro do shell e com aviso sobre dados temporários. Nenhuma função de publicação foi simulada.
- A correção da Fase 02 não estava aplicada nesta cópia: `basePath: "/sistema"` ainda existia. Foi removido como pré-requisito mínimo, mantendo `app/sistema` e os links `/sistema/...`. Nenhum script das fases anteriores foi executado.
- `Ver portal` preserva o acesso externo; usa `NEXT_PUBLIC_SITE_URL` quando configurado e `http://localhost:3000` como padrão local. Nenhum arquivo de ambiente foi alterado.
- Script fornecido salvo em `automation/scripts/03-shell-administrativo.ps1`, com modos `Preflight` e `Finalizar`, sem mudanças no conteúdo funcional. Preflight aprovado na branch esperada.
- Sem alterações em `apps/site`, pacotes compartilhados, backend, dependências do projeto ou stack. Fase 04 não iniciada.
- Ferramentas temporárias de revisão: Prettier e agent-browser via cache npm, sem alteração de manifests/lockfile.
- Revisão React: páginas permanecem componentes de servidor, exceto os pequenos componentes interativos de navegação; sem importação de arrays de dados de negócio nas telas novas, sem `any` novo e sem efeitos desnecessários.

### Validação e finalização

Em andamento: validação visual, typecheck e build antes do commit. A inicialização local do Next levou 134,7 segundos. Uma tentativa de typecheck durante a geração dos arquivos `.next/types` encontrou TS6053 (arquivos gerados ausentes); a validação final será executada com o servidor encerrado para evitar concorrência sobre esse diretório.

### Próxima fase

Fase 04 — domínio editorial, contratos e mocks. A apresentação Editorial desta fase não oferece cadastro, edição ou publicação de matérias. Módulos planejados não executam operações reais. Aguardar autorização para a Fase 04.

---

# Histórico — rodada documental

## Identificação

- Data: 17/09/2026.
- Escopo entregue: documentação e organização arquitetural, parte do Lote 1.
- Branch: `feature/jornalir-core-foundation-20260917`.
- Base: `main`, SHA `2bf8a7e272a6f9aa0797261f635ee07f309357f8`.
- SHA final: sem novo commit nesta parte; HEAD permanece no SHA base. Documentos locais ainda não rastreados.
- Lote 1 completo: pendente. Não avançar sem autorização para a próxima parte.

## Entregas

- `CURRENT-STATE.md`: fotografia objetiva e limitações do levantamento.
- `ARCHITECTURE.md`: arquitetura-alvo e princípios do núcleo editorial.
- `FRONTEND-STRUCTURE.md`: responsabilidades, classificação e recomendação para rotas.
- `DATA-BOUNDARIES.md`: separação UI → service → repository → provider.
- Este `HANDOFF-CODEX.md`: registro inicial da rodada.
- `PLANO-MESTRE-JORNALIR.md`: cópia anterior do anexo, preservada sem reescrita; igualdade SHA-256 com a fonte conferida.

Preservados também `PROMPT-MESTRE-CODEX-JORNALIR.md`, o resumo `../REESTRUTURACAO-PROJETO-GPT.md` e os dois documentos históricos de banco. Nenhum arquivo funcional ou configuração foi alterado.

## Decisões propostas

Manter o monorepo e as versões atuais. Portal será exclusivamente público; sistema concentrará CMS/administração. Domínio em `types`, serviços/repositórios em `core` se necessário, implementações simuladas em `mocks`, componentes realmente comuns em `ui`.

Preservar funções úteis sem impor o visual antigo ao redesign. Preservar jornal digital/Drive/flipbook e administração legada até a substituição planejada. Supabase exclusivo do JornalIR será futuro provider e fonte de dados comum, sem conexão agora.

Para a duplicação de `/sistema`, recomendar remover futuramente `basePath` e manter `app/sistema`; revisar links e compatibilidade no mesmo trabalho técnico. Não foi corrigido nesta rodada.

## Verificação desta parte

- `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse main` e consulta de existência da branch antes de criá-la.
- Branch criada explicitamente do SHA base; a restrição de escrita em `.git` exigiu execução autorizada fora da restrição inicial.
- Leitura dos arquivos relevantes e consulta da documentação oficial do Next.js 14 para `basePath`.
- Revisão final dos cinco documentos novos, dos links Markdown locais, preservação dos documentos anteriores e estado Git.
- Nenhum build, typecheck, servidor, teste funcional ou instalação: mudanças exclusivamente documentais.
- Sem dependências novas, commit, push, merge, deploy ou integração operacional.

## Problemas preexistentes e riscos

- Mocks de administração em memória e IndexedDB do portal são fontes independentes.
- Categorias fixas e tipos antigos não cobrem o novo domínio; trocar tipos sem adaptação pode quebrar o portal.
- Páginas ADMIN permanecem no portal: matérias, anúncios e configurações do site.
- Possível prefixo duplicado de rota, ainda sem validação em navegador.
- Documentos históricos de banco divergem em detalhes do Plano Mestre; não os executar como especificação definitiva.
- O Git avisou que não pôde ler o ignore global do usuário; as consultas ao repositório funcionaram.
- Funcionamento atual de build, telas e integrações não foi validado nesta parte.

## Continuidade

Próxima pequena parte sugerida, após autorização: corrigir de forma isolada a organização de `/sistema`, preservando anúncios/patrocinadores e validando navegação. Depois, implementar contratos editoriais e a camada mock antes de ampliar telas.

Ainda pertencem ao Lote 1: domínio tipado, serviços/repositórios, mocks editoriais, novo layout administrativo, listagem/filtros, cadastro inicial e páginas auxiliares, com validação ao fechar os blocos funcionais.

Lote 2 continua reservado para CMS completo, editor e operações avançadas de imagens, preview e transições. Supabase, autenticação real, OCR, financeiro completo, integrações e redesign do portal permanecem fora da parte atual.

Ao retomar, ler Plano e Prompt Mestre, conferir branch/status e preservar os arquivos locais. Não interpretar esta documentação como autorização para implementar a próxima parte. Parar ao concluir a rodada documental e aguardar o usuário.
