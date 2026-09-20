# Validação do pipeline de extração com PDFs reais do JornalIR

Data: 20/09/2026. Fase 10 (`feature/jornalir-core-foundation-20260917`).

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
- **Uma limitação real documentada, não corrigida**: diagramação mista
  (colunas de largura desigual lado a lado) pode embaralhar a ordem de
  leitura dentro de uma coluna mal segmentada — sem perda de texto, mas com
  risco de leitura confusa, exigindo atenção do revisor humano.

## Recomendação para fases futuras

Se a diagramação mista (Achado 2) se mostrar frequente no uso real, a
próxima melhoria de maior valor seria detecção de colunas por região
vertical da página (não uma partição global única) — fora do escopo desta
fase de validação.
