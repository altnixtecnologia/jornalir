# Auditoria do site legado (informativoregional.net)

Gerado em: 2026-09-26T14:15:05.404Z

Modo: **audit/read-only** — nenhuma gravação no Supabase, nenhum download de imagem, nenhuma alteração no site antigo (Fase 34).

## Fonte de dados escolhida

Sitemaps (`sitemap_index.xml`) só cobrem conteúdo recente (estilo Google News) e servem apenas para descoberta de categorias.
O arquivo histórico completo é acessado via paginação das páginas de listagem por categoria (`?pagina=N&filtro=antigos`), que expõe
o total oficial ("Total N matérias") e a última página — usados aqui como base objetiva de cobertura (item 10).

## Cobertura por categoria

| Categoria | Editoria equivalente | Total oficial (site) | Total encontrado | Páginas percorridas | Paginação completa |
|---|---|---|---|---|---|
| agricultura | **NÃO MAPEADA** | 339 | 337 | 29/29 | sim |
| classificados | **NÃO MAPEADA** | 32 | 30 | 3/3 | sim |
| colunistas/apae_de_sao_joao_do_sul | Colunistas | 5 | 10 | 1/1 | sim |
| colunistas/informativo_contabil | Colunistas | 17 | 24 | 2/2 | sim |
| colunistas/outras | Colunistas | 94 | 92 | 8/8 | sim |
| colunistas/roni_raupp | Colunistas | 107 | 108 | 9/9 | sim |
| esportes | Esportes | 1181 | 1179 | 99/99 | sim |
| geral | Geral | 16547 | 16544 | 1379/1379 | sim |
| policia | Polícia | 900 | 898 | 75/75 | sim |
| politica | Política | 1165 | 1163 | 98/98 | sim |
| saude | Saúde | 1866 | 1864 | 156/156 | sim |
| sociais | Sociais | 1146 | 1144 | 96/96 | sim |

**Total oficial (soma das categorias):** 23399
**Total encontrado (itens de listagem coletados):** 23393

**Diferença:** 6 (reportada sem tentar "corrigir" silenciosamente — ver páginas com erro abaixo).

## Período coberto

- Data mais antiga detectada: 2015-06-27
- Data mais recente detectada: 2026-09-25
- Itens com data "zero" (bug real do CMS legado, renderiza como 31/12/1969 21:00): 7
- Itens sem data detectável na listagem: 0

## Imagens (nível de listagem)

- Itens com miniatura na listagem: 23052
- Itens sem miniatura na listagem (`titulo-sem-img`): 341

Extração completa de imagens (capa, galeria, legenda, crédito) foi validada em uma amostra por categoria — ver `amostrasDetalhe` no JSON anexo. Nenhuma imagem foi baixada nesta fase.

## Autores e colunistas

- Autores/fontes encontrados na amostra: Secom/SC, Imprensa CRPO LIT, VACINAÇÃO RS, RCN, Agência Brasil, Prefeitura Municipal de Torres, Assessoria de Comunicação / Epagri
- Colunistas encontrados na amostra: colunistas/roni_raupp :: COLUNA POLÍTICA - POR RONI RAUPP, colunistas/apae_de_sao_joao_do_sul :: COLUNA 21/05/2020, colunistas/apae_de_sao_joao_do_sul :: DICAS E INFORMAÇÕES DA APAE DE SÃO JOÃO  DO SUL:, colunistas/apae_de_sao_joao_do_sul :: COLUNA 03/06/2020, colunistas/informativo_contabil :: COLUNA  IR 441 (04/06/2020)

Observação: a página de matéria do site legado **não tem campo estrutural de autor** — o único texto disponível é um link `.post-cat` que, na prática, carrega o nome de quem assinou a nota (ex.: "Assessoria de Comunicação"), não uma categoria. Deve ser tratado como `author_name`/`autor original`, nunca como editoria.

## Localidades

O site legado **não possui campo estruturado de cidade/localidade** nas páginas auditadas (nem na listagem, nem na página de matéria). Não foi feita nenhuma tentativa de inferir cidade a partir do título ou corpo do texto (proibido nesta fase). Qualquer regra de localidade para a importação futura precisa ser definida e aprovada separadamente.

## Categorias não mapeadas

- `classificados`
- `agricultura`

Estas categorias existem no site legado mas não têm editoria equivalente hoje. Nenhuma editoria foi criada automaticamente.

## Duplicidades

- URLs duplicadas na coleta: 14
- Slugs repetidos dentro da mesma categoria: 638
- Título + data idênticos: 48

Título+data idêntico **não** foi tratado como prova de duplicidade real — apenas reportado como candidato a revisão manual futura (item 8).

## Páginas com erro

Nenhuma página de listagem retornou erro.

## Campos que não puderam ser extraídos de forma confiável nesta fase

- Autor estruturado (não existe no HTML — apenas o rótulo `.post-cat`, tratado como `sourceLabel`).
- Legenda/crédito por imagem: campos existem no HTML (`.p-galery-descricao`/`.p-galery-credit`) mas estavam vazios em todas as amostras coletadas.
- Subcategoria/coluna estruturada fora de `colunistas/*`: não observada.

## O que esta auditoria NÃO fez (por definição do escopo da Fase 34)

- Não inseriu nada em `articles`, `media_assets` ou `article_external_sources`.
- Não baixou nenhuma imagem.
- Não alterou o site antigo.
- Não fez a extração de campo completo (corpo/imagens/legendas) de todo o acervo — apenas de uma amostra por categoria, para validar os seletores. O restante do corpo de cada matéria pode ser extraído sob demanda na Fase 35, reaproveitando o mesmo coletor.

Dados brutos completos: `scripts/legacy-audit/output/inventory.ndjson` (não versionado — grande demais para o repositório).
