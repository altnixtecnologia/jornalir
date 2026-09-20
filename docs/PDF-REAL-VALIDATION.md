# Validação do pipeline de extração com PDFs reais do JornalIR

Data: 20/09/2026 (Fase 10) e 21/09/2026 (Fase 11). Branch `feature/jornalir-core-foundation-20260917`.

## Adendo — Fase 11: detecção de colunas por região vertical (21/09/2026)

A Fase 10 documentou (Achado 2, abaixo) uma limitação real: o detector de
colunas olhava para a página inteira de uma vez só, então uma faixa
intermediária com duas colunas lado a lado (ex.: matéria larga + coluna
estreita de horóscopo) não era separada quando as faixas de topo/base da
mesma página já tinham tinta cobrindo aquela mesma faixa de x. A Fase 11
substitui a detecção "página inteira" por detecção **por região vertical**:
a página é amostrada em bandas horizontais (`packages/pdf-extraction/src/columns.ts`,
`detectColumnSegments`), a estrutura de colunas de cada banda é medida
independentemente (mesma técnica de vão de tinta da Fase 09,
`detectColumns`), e bandas adjacentes com a mesma estrutura são fundidas em
uma única região — a comparação usa só a posição dos vãos *entre* colunas
(não a borda externa esquerda/direita, que varia naturalmente com texto
alinhado à esquerda) para não fragmentar artificialmente uma coluna única
só porque o título é mais curto que o corpo. `PageExtraction.columnRanges`
(um único `Array<[number, number]>` para a página inteira) foi substituído
por `columnSegments: ColumnSegment[]` (`{ yTop, yBottom, xStart, xEnd }` por
segmento) — cada segmento continua se comportando, para o resto do
pipeline (parágrafos, matérias, conservação), exatamente como uma "coluna"
da Fase 09/10 se comportava; só passou a existir mais de uma estrutura por
página quando o layout realmente muda de faixa para faixa. Uma página com
estrutura uniforme do topo à base continua colapsando em uma única região —
mesmo resultado de antes.

### Prova determinística (fixture sintética)

Novo teste (`packages/pdf-extraction/test/columnRegions.test.ts`,
`buildMixedLayoutFixture` em `test/fixtures.ts`) reproduz exatamente o
padrão do Achado 2: matéria larga no topo e na base da página (atravessando
a faixa de x onde a coluna estreita vai existir), faixa intermediária com
coluna larga (continuação da matéria) e coluna estreita (horóscopo) lado a
lado. Antes da Fase 11, um teste equivalente falharia (o texto das duas
colunas da faixa do meio se misturaria em uma única linha). Depois:
detecção de pelo menos 2 regiões verticais distintas; nenhum candidato
mistura o marcador da matéria larga com o da coluna estreita; nenhum
marcador se perde; **cobertura textual permanece 100%, zero órfãos, zero
duplicados, zero alterados, zero fora de ordem** — a correção só muda como
os blocos são agrupados em candidatos, nunca o texto em si. Um teste
adicional confirma que uma página de estrutura uniforme (fixture da Fase
09) continua com uma única região, sem fragmentação artificial.

### Revalidação das 8 páginas reais da Fase 10

Reexecutado `scripts/validate-real-pdfs.ts` sobre as mesmas 8 páginas.
**Nenhuma regressão de conservação**: as 8 continuam com 100% de cobertura
por caracteres, zero órfãos, zero duplicados, zero caracteres alterados,
zero blocos fora de ordem — idêntico à Fase 10. O que mudou é a
segmentação (mais colunas/regiões detectadas, mais candidatos):

| Arquivo | Pág. | Colunas (F10 → F11) | Regiões (F11) | Candidatos (F10 → F11) | Cobertura (chars) |
| --- | --- | --- | --- | --- | --- |
| IR 685 | 1 | 1 → 10 | 7 | 6 → 13 | 100% |
| IR 685 | 4 | 1 → 6 | 4 | 6 → 11 | 100% |
| IR 685 | 5 | 3 → 3 | 1 | 3 → 3 | 100% |
| IR 685 | 12 | 2 → 3 | 2 | 3 → 4 | 100% |
| IR 685 | 18 | 2 → 3 | 2 | 3 → 4 | 100% |
| IR 685 | 23 | 1 → 31 | 13 | 31 → 48 | 100% |
| IR 697 | 20 | 2 → 3 | 2 | 4 → 5 | 100% |
| IR 699 | 18 | 3 → 4 | 2 | 4 → 5 | 100% |

Inspeção manual do conteúdo confirma que a maior parte do aumento de
colunas/candidatos é uma **melhoria real**: em 685/p12, por exemplo, a
faixa superior (94pt) agora separa corretamente "12 Região" (número de
página) de "ELÉTRICA CONTINUARÁ SEM..." (início do título), enquanto o
resto da página permanece como uma única região de coluna única contendo o
corpo inteiro da matéria (1002 caracteres, intacto, não fragmentado) — antes
esse cabeçalho ficava implicitamente misturado à mesma coluna única da
página inteira. O mesmo padrão se repete em 685/p18, 697/p20 e 699/p18:
cabeçalho de página isolado em uma micro-região própria (sinalizado
`possibleAdvertisement`, trivial de descartar na revisão, mesmo
comportamento já usado desde a Fase 09 para blocos curtos isolados), corpo
da matéria real preservado como um único candidato coeso.

### Limitação que persiste — páginas 4 e 23 (diagramação em grade densa)

As duas páginas mais complexas do lote (685/p4, a ata de câmara já citada
no Achado 3 da Fase 10, e 685/p23, a coluna social/horóscopo do Achado 2)
**não são totalmente resolvidas** pela detecção por região. Inspeção
manual de 685/p23 mostra por quê: não é uma página com 2-3 faixas verticais
limpas, é uma grade genuinamente densa onde a fronteira entre colunas se
desloca a cada poucas linhas (avisos de aniversariantes, horóscopo por
signo e o artigo sobre microplásticos intercalados na mesma região visual,
com larguras de coluna que mudam de banda para banda). A maioria dos novos
candidatos ficou corretamente isolada por assunto (ex.: o corpo do artigo
de microplásticos aparece hoje fatiado em vários candidatos consecutivos,
mas cada um só com texto do próprio artigo — antes ficava tudo em uma
coluna só, misturado), mas pelo menos um candidato residual ainda mistura
três assuntos diferentes na mesma banda (microplásticos + horóscopo +
cartaz de igreja), porque nessa banda específica a largura da "coluna
estreita" se sobrepõe à da matéria vizinha o bastante para o algoritmo de
vão de tinta não separar os dois.

**Isto continua sendo uma limitação real, documentada, não forçada com uma
correção arriscada** — consistente com a regra desta fase de só corrigir
com regra determinística seguramente aplicável. Resolver este caso por
completo exigiria segmentação de layout verdadeiramente bidimensional (não
só bandas horizontais empilhadas), o que está fora do escopo de uma
"melhoria determinística pontual". Importante: mesmo nas páginas 4 e 23,
**a cobertura textual continua 100%** — o problema remanescente é só de
agrupamento/ordem de leitura em uma sub-região específica dessas duas
páginas densas, nunca perda ou invenção de texto.

### Recomendação para fases futuras

Se páginas no padrão de 685/p4 e 685/p23 (grades densas com múltiplas
colunas de largura variável por linha) se mostrarem frequentes no uso real
— e não só um caso raro de duas páginas específicas — a próxima melhoria de
maior valor seria segmentação de layout bidimensional real (ex.: análise
por blocos de texto conectados, não bandas horizontais), possivelmente com
apoio visual (renderização da página), o que cruzaria para uma mudança de
escopo maior do que uma fase de refinamento pontual.

---

Data original deste relatório: 20/09/2026. Fase 10 (`feature/jornalir-core-foundation-20260917`).

## Objetivo e método

Provar a fidelidade do pipeline de extração (`@ir/pdf-extraction`, Fase 09) contra
edições reais do jornal, já existentes no acervo do repositório
(`apps/site/public/uploads/jornal-online/`), em vez de apenas fixtures sintéticas.

Os sete arquivos do acervo (`IR 685`, `687`, `696`, `697`, `698`, `699`, `700`,
todos `_compressed.pdf`, 24 páginas cada) foram **apenas lidos** — nenhum foi
alterado, movido ou reescrito. Antes de escolher as páginas, uma inspeção
prévia (contagem de itens de texto e colunas detectadas por página, script
descartável) mapeou as 168 páginas das sete edições, e a partir dela foram
escolhidas oito páginas representativas, cobrindo os cenários pedidos.

O diagnóstico é reproduzível pelo script permanente
`packages/pdf-extraction/scripts/validate-real-pdfs.ts`
(`npx tsx scripts/validate-real-pdfs.ts`, de dentro do pacote), que roda o
pipeline real (`extractPdf`) e a checagem de conservação independente
(`checkConservation`, nova nesta fase) sobre cada página selecionada e
imprime os números em JSON. Este documento interpreta esses números.

## Como a conservação é medida

A Fase 10 adicionou `paragraphs.ts` → `PageExtraction.paragraphs`: o catálogo
completo de blocos de texto que o pipeline detectou na página, cada um com
identidade estável (`id`). `checkConservation` (`packages/pdf-extraction/src/conservation.ts`)
é uma auditoria **independente** — não confia no agrupamento em matérias,
recontra do zero — que verifica, por página:

- **blocos encontrados / usados / órfãos**: todo parágrafo detectado aparece
  em exatamente um bloco de um candidato? Um parágrafo que não aparece em
  nenhum é órfão (possível perda).
- **duplicações**: algum parágrafo aparece em mais de um bloco/candidato?
- **caracteres alterados**: o texto de algum bloco final difere do texto do
  parágrafo de origem?
- **ordem**: dentro de um mesmo candidato, os blocos aparecem na mesma ordem
  vertical (topo→base) dos parágrafos de origem na coluna?
- **cobertura**: por contagem de blocos e por total de caracteres.

Nada aqui decide ou corrige — só mede e relata. Os avisos entram na mesma
lista de avisos do pipeline (nenhum canal oculto).

## Resultado agregado — conservação textual

| Arquivo | Pág. | Motivo da escolha | Colunas | Candidatos | Cobertura (chars) | Órfãos | Duplicados | Alterados | Fora de ordem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IR 685 | 1 | Capa — pouco texto, manchete grande | 1 | 6 | **100%** | 0 | 0 | 0 | 0 |
| IR 685 | 4 | Coluna única densa — várias matérias, texto longo, acentos | 1 | 6 | **100%** | 0 | 0 | 0 | 0 |
| IR 685 | 5 | Página inteira de publicidade (rótulo "Publicidade" na própria página) | 3 | 3 | **100%** | 0 | 0 | 0 | 0 |
| IR 685 | 12 | Duas colunas detectadas | 2 | 3 | **100%** | 0 | 0 | 0 | 0 |
| IR 685 | 18 | Duas colunas detectadas, volume moderado | 2 | 3 | **100%** | 0 | 0 | 0 | 0 |
| IR 685 | 23 | Maior volume de caracteres da edição (coluna social/horóscopo) | 1 | 31 | **100%** | 0 | 0 | 0 | 0 |
| IR 697 | 20 | Duas colunas em edição diferente, para comparar consistência | 2 | 4 | **100%** | 0 | 0 | 0 | 0 |
| IR 699 | 18 | 3 colunas com volume moderado (não quase vazia) | 3 | 4 | **100%** | 0 | 0 | 0 | 0 |

**Todas as oito páginas: 100% de cobertura textual, zero blocos órfãos, zero
duplicações, zero caracteres alterados, zero blocos fora de ordem.** Nenhum
caractere da camada de texto original ficou de fora de algum candidato, em
nenhuma das páginas testadas — inclusive nas mais complexas (23 e 5).

Isso confirma, com dados reais (não só fixtures controladas), a garantia
estrutural do pipeline: como `groupParagraphsIntoArticles` sempre insere cada
parágrafo detectado em algum grupo e `classifyArticleGroup` sempre converte
cada parágrafo de um grupo em algum bloco, não há caminho no código atual que
descarte um parágrafo silenciosamente. A checagem de conservação existe
justamente para não depender apenas dessa garantia "por construção" — ela
audita o resultado de fato, e nas 8 páginas reais não encontrou nenhuma
exceção.

## Avisos gerados (amostra) e o que significam

### Achado 1 — mapeamento de fonte quebrado em títulos (real, do PDF de origem)

Em **6 das 8 páginas** (685/p1, 685/p4, 685/p12, 685/p18, 685/p23, 697/p20), o
pipeline sinalizou títulos como:

```text
"nOVA GESTÃO" · "PROFESSOR MACK CITADIn VOLTA APRESEnTA" · "EDUCAÇÃO DE
PRAIA GRAnDE" · "GOVERnO EM SÃO JOÃO DO SUL" · "COnSUMIDOR DE EnERGIA" ·
"ELÉTRICA COnTInUARÁ SEM" · "COBRAnÇA EXTRA nA COnTA" · "EVEnTO EM ALUSÃO" ·
"AO JAnEIRO BRAnCO" · "XIV COSTELÃO nA ELIMInATÓRIAS..." · "MOÇãO DE
CONGRATULAÇãO" · "A GUILhERME BIASI" · "ACOLhEDORES DO BRASIL"
```

Inspecionando os itens brutos que o `pdfjs-dist` retorna (antes de qualquer
junção deste pipeline), a letra minúscula já vem assim isolada, como um item
de texto próprio: por exemplo a palavra "APRESENTA" chega como três itens
consecutivos `"APRESE"`, `"n"`, `"TA"`, todos na mesma fonte
(`g_d0_f4`) e mesmo tamanho. **Isto é um defeito de mapeamento de fonte no
PDF de origem** (o glifo do "N" maiúsculo dessa fonte de título está associado
ao código Unicode de "n" minúsculo no CMap da fonte) — confirmado, não é algo
introduzido pela junção de linhas/parágrafos deste pipeline. O mesmo defeito
aparece com "ã" e "h" minúsculos em títulos da edição 697, então não é
exclusivo da letra "N".

Correção aplicada nesta fase: `warnings.ts` ganhou
`hasIsolatedLowercaseInUppercaseRun`, um detector determinístico (por padrão
de maiúscula/minúscula por palavra, nunca por conteúdo) que sinaliza esse
padrão sem tentar adivinhar a letra correta. Exclui deliberadamente o plural
comum de sigla ("PDFs", "CDs") para não gerar ruído em casos legítimos.
Nenhum texto é alterado — apenas um aviso é adicionado, visível na revisão.

### Achado 2 — diagramação mista (matéria corrida + coluna estreita lado a lado)

> **Atualização da Fase 11**: parcialmente corrigido por detecção de colunas
> por região vertical — ver adendo no topo deste documento. Melhora a
> maioria dos casos (inclusive um teste automatizado que prova o mecanismo
> funciona), mas as duas páginas mais densas do lote (p4, p23) continuam
> com agrupamento imperfeito em pelo menos uma sub-região, documentado como
> limitação residual.

A página 23 (coluna social, com um artigo sobre microplásticos correndo ao
lado de uma coluna de horóscopo) e, em menor grau, um trecho da página 4
(um resultado de jogos ao lado de um texto corrido) produziram candidatos
com texto que mistura frases de dois assuntos diferentes na mesma linha —
por exemplo:

```text
"onipresentes em nosso ambiente, desde as profundezas O morador de São
João do Sul, Gêmeos (21/05 a 20/06)"
```

Isso acontece porque o **detector de colunas atual funciona sobre a largura
inteira da página, uma vez só** (histograma de vãos de tinta global). Quando
duas regiões da página têm colunas de larguras diferentes lado a lado (uma
matéria larga + uma coluna estreita de horóscopo, por exemplo), ou quando o
vão entre elas é estreito demais para superar o limiar de detecção, o
pipeline não separa essas duas regiões — o texto das duas acaba na mesma
"coluna" detectada, na ordem em que aparece verticalmente, mesmo que
visualmente pertença a blocos lado a lado diferentes.

**Isto é uma limitação real e documentada, não corrigida nesta fase.**
Corrigi-la corretamente exigiria detecção de colunas por região vertical da
página (não uma única partição global), uma mudança de algoritmo maior do
que uma "regra determinística segura" pontual — desproporcional ao escopo
desta fase de validação. Importante: **mesmo nesse cenário, a cobertura
textual continua em 100%** — nenhuma palavra é perdida ou inventada; o
problema é a **ordem de leitura entre regiões**, não a fidelidade de
caracteres. A checagem de "fora de ordem" desta fase verifica consistência
*dentro* da coluna detectada (os blocos aparecem na mesma ordem vertical dos
parágrafos de origem); ela não sabe que "deveria" ter havido duas colunas
onde só uma foi detectada — essa é uma limitação também do próprio checador,
registrada aqui.

### Achado 3 — "título" implausivelmente longo por parágrafo mal segmentado (corrigido nesta fase)

Na página 4, um candidato tinha um "título" de mais de 900 caracteres — na
prática, uma ata de câmara diagramada em uma grade densa de nomes/textos
curtos que o agrupador de parágrafos (mesmo tamanho de fonte + vão pequeno)
juntou em um único parágrafo enorme, que por estar em fonte maior que o
corpo foi rotulado com confiança como "título". **Correção aplicada**:
`articleGroups.ts` agora só aceita o primeiro parágrafo de um grupo como
título quando ele tem no máximo 160 caracteres (limite generoso para
manchetes reais); acima disso, o grupo inteiro cai para o caminho de baixa
confiança (`lowConfidenceTitle: true`, tudo mantido como corpo, sinalizado
para revisão) — o texto não muda de lugar por adivinhação, apenas deixa de
ser rotulado como título com falsa segurança. Verificado antes/depois: o
mesmo parágrafo de 900+ caracteres, que antes virava um "título" absurdo,
agora aparece corretamente como corpo de um candidato de baixa confiança.

### Achado 4 — página inteira de publicidade com pouco texto (comportamento esperado, não um bug)

A página 5 de IR 685 contém apenas rodapé, número de página e a palavra
"Publicidade" — o resto é uma imagem de anúncio de página inteira (12
imagens detectadas na página). O detector de colunas, com poucos itens
espalhados, encontrou 3 "colunas" — tecnicamente correto (há vãos de tinta
reais entre esses fragmentos dispersos), mas sem sentido como "colunas
editoriais". Na prática isso não é um problema: os três candidatos
resultantes ("Publicidade", "05", e um bloco de rodapé) são triviais,
óbvios de descartar na revisão, e o próprio PDF já rotula a página como
"Publicidade". Nenhuma correção foi aplicada — não há evidência de que isto
seja uma falha de fidelidade, apenas uma página com pouquíssimo conteúdo
editorial de verdade.

### Achado 5 — capa com muitas matérias "teaser" sinalizadas como possível continuação

Na página 1 (capa), quase todos os candidatos foram marcados
`possibleContinuation: true`. Isso é esperado para uma capa: os textos são
chamadas curtas ("Página 06", "Página 21"...) que apontam para matérias
completas nas páginas internas, então naturalmente não terminam com
pontuação de fechamento. Não é uma falha — é o sinalizador de continuação
funcionando exatamente como projetado (aponta candidatos que precisam de
atenção do revisor), aplicado a um tipo de página onde ele dispara com mais
frequência por natureza do conteúdo.

## O que ficou provado

- **Fidelidade textual**: 100% de cobertura, zero perda, zero duplicação,
  zero alteração de caracteres, zero blocos fora de ordem, nas 8 páginas
  reais testadas (168 páginas inspecionadas previamente para escolher as
  mais representativas).
- **Rastreabilidade**: todo bloco de texto detectado em cada página tem
  identidade própria e é possível provar, para cada um, se foi usado e onde.
- **Duas correções reais, determinísticas e seguras** aplicadas a partir do
  diagnóstico com dados reais (nunca inventando texto): sinalização de
  possível mapeamento de fonte quebrado; limite de tamanho plausível para
  título.
- **Uma limitação real documentada, então parcialmente corrigida na Fase
  11**: diagramação mista (colunas de largura desigual lado a lado) podia
  embaralhar a ordem de leitura dentro de uma coluna mal segmentada — sem
  perda de texto, mas com risco de leitura confusa. A Fase 11 introduziu
  detecção de colunas por região vertical (ver adendo no topo deste
  documento), que resolve a maioria dos casos reais e é provada por um
  teste automatizado; duas páginas com diagramação em grade muito densa
  (p4, p23) continuam com agrupamento imperfeito em uma sub-região, agora
  documentado como limitação residual da Fase 11.

## Recomendação para fases futuras (registro original da Fase 10)

Se a diagramação mista (Achado 2) se mostrar frequente no uso real, a
próxima melhoria de maior valor seria detecção de colunas por região
vertical da página (não uma partição global única) — fora do escopo desta
fase de validação. **Implementado na Fase 11** (ver adendo no topo deste
documento e "Recomendação para fases futuras" da Fase 11 para o que ainda
resta).
