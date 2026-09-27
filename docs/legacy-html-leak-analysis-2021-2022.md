# Análise do vazamento de HTML em `bodyTextFull` — 2021-2022 (Fase 44C)

Análise pedida pela revisão do ChatGPT sobre HEAD `a786cec`, feita **exclusivamente sobre o cache já existente** (`output/batches/2021-2022/details.ndjson`), sem nenhum refetch de rede. Cobre os 160 casos encontrados na Fase 44B.

## 1. Assinatura/padrão e quantidade

| Assinatura | Quantidade |
|---|---|
| `data-filename="retriever"` isolado (sem `style=`) | 99 |
| `style="width: 50%; ..."` isolado (sem `data-filename=`) | 45 |
| `style="width: Npx; height: Npx; ..."` (com ou sem `data-filename=` junto) | 15 |
| Outro (`style="width: 25%; float: right;"`) | 1 |
| **Total** | **160** |

Duas assinaturas concentram 144/160 (90%) dos casos.

## 2. Posição do vazamento em `bodyTextFull`

| Posição | Quantidade |
|---|---|
| Fim do corpo (>85% do texto) | 52 |
| Meio do corpo | 108 |

O vazamento não fica sempre no fim — na maioria dos casos (108/160) ele aparece no meio do texto, exatamente no ponto em que a imagem estava posicionada originalmente na matéria (entre dois parágrafos de texto editorial real).

## 3. Contexto (100–200 caracteres antes/depois)

**`data-filename="retriever"` isolado** — `colunistas/roni_raupp/coluna_politica__por_roni_raupp.420064`:
> "...ntares dizer como e com o que o Executivo vai gastar R$ 34,7 bilhões do dinheiro público neste ano." **`data-filename="retriever" style="width: 0px; height: 0px;"> data-filename="retriever" style="width: 25%;">`**

**`style="width: 50%..."` isolado** — `geral/comunidade_de_barrinha_ja_tem_novo_acesso_liberado.407103`:
> "...to e pegar a direita, obedecendo a sinalização, no qual já terá acesso a nova estrada à comunidade." **`style="width: 50%;" data-filename="retriever">`**

**`style="width: Npx; height: Npx;..."`** — `geral/rs_torres_decreto_municipal_publicado_neste_domingo_segue_o_estadual_divulgado_na_ultima_sexta_feira.406721`:
> "...r de R$ 2 mil até R$ 1,5 milhão. Além disso, os valores podem ser dobrados em caso de reincidência." **`style="width: 325.358px; height: 325.358px;" data-filename="retriever"> data-filename="retriever" style="width: 328.844px; height: 328.844px;"> data-filename="retriever" style="width: 332.844px;...`** (3 fragmentos concatenados — 3 imagens quebradas na mesma matéria)

**Caso no meio do corpo (não no fim)** — `saude/secretaria_de_saude_confirma_14o_obito_por_covid_19_em_sao_joao_do_sul.417064`:
> **`style="width: 25%; float: right;" data-filename="retriever">`** "Na tarde desta quinta-feira, 06 de maio, a Secretaria Municipal de Saúde de São João do Sul confirmou por meio de mais um boletim da Covid-19..."

## 4. O mesmo fragmento aparece literalmente em `bodyHtml`?

**Sim, em 160/160 casos (100%).** Inspecionando o HTML bruto (`bodyHtml`), o padrão sempre aparece assim:

```html
<p> data-filename="retriever" style="width: 50%;"&gt;<br></p>
```

O detalhe crucial: o `>` de fechamento está **escapado como entidade `&gt;`**, não é um `>` real de fechamento de tag. Isso comprova que não se trata de uma tag `<img>` real mal-parseada pelo nosso scraper — é HTML malformado **na própria origem** (o CMS legado, provavelmente ao editar/colar uma imagem, perdeu o prefixo `<img src="..." ` da tag e sobrou só a cauda de atributos, que ficou como texto/entidade dentro de um `<p>`).

## 5. Quantos são resíduo mecânico claro vs. ambíguos

**160/160 (100%) são resíduo mecânico claro de markup de imagem quebrada — nenhum é ambíguo ou conteúdo editorial disfarçado.** Evidências:
- Todos terminam exatamente no padrão `(data-filename="retriever"|style="width: ...")+  &gt;`.
- Em nenhum caso há palavras/frases em português junto ao fragmento — só sintaxe de atributo HTML.
- O texto imediatamente antes e depois do fragmento é sempre prosa editorial legítima e contínua (confirmado pela amostra acima).

## 6. Sanitização implementada

Adicionado `scripts/legacy-audit/lib/sanitize.mjs` com a regex `IMG_ATTR_RESIDUE`, que casa apenas a sequência `(data-filename="retriever"|style="...")+ &gt;` — nunca um `>` real, nunca texto comum. Integrada em `lib/parse.mjs` (`parseArticlePage`), aplicada ANTES de extrair parágrafos/texto/HTML final, para que todo fetch futuro (2023-2024, 2025-2026) já saia limpo.

**Validação de segurança (zero refetch):**
- 160/160 casos de 2021-2022 completamente sanitizados (nenhum resíduo remanescente).
- **0 falso-positivo** nos outros 4.327 artigos de 2021-2022 sem o vazamento.
- **0 falso-positivo** em todo o cache de 2015-2016 (1.635 artigos) e 2017-2018 (2.511 artigos).
- 203/203 casos de 2019-2020 também seriam completamente cobertos pela mesma regra (ver seção 7) — sem nenhum falso-positivo nos 4.897 artigos restantes desse lote.

O cache de 2021-2022 foi reprocessado localmente (`reprocess-cache-html-leak.mjs`, sem nenhum fetch de rede — só recalcula `bodyHtml`/`bodyTextFull`/`bodyParagraphCount` a partir do `bodyHtml` já em cache) e o preflight foi rerodado 100% a partir do cache: os 160 casos voltaram a `eligible`. Números finais: eligible=4475, needs_review=13 (idênticos aos da Fase 44 original, antes de qualquer vazamento ter sido detectado).

### Lista completa dos 160 casos (2021-2022) — todos agora `eligible` (corpo limpo)

| external_id | Título | Assinatura | Posição |
|---|---|---|---|
| 420064 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | fim |
| 407301 | GOVERNO DIVULGA CALENDÁRIO DE PAGAMENTOS DO BOLSA FAMÍLIA EM 2021 | data-filename="retriever" (isolado) | meio |
| 407295 | ENEM TERÁ REGRAS PARA EVITAR CONTÁGIO PELO NOVO CORONAVÍRUS | data-filename="retriever" (isolado) | fim |
| 407276 | BENEFÍCIOS DO INSS ACIMA DE UM SALÁRIO MÍNIMO TÊM REAJUSTE DE 5,45% | data-filename="retriever" (isolado) | meio |
| 407237 | RS INICIA ESTUDO PARA O PRIMEIRO SISTEMA DE TRANSPORTE EM CÁPSULAS DE ALTÍSSIMA VELOCIDADE | data-filename="retriever" (isolado) | meio |
| 407219 | 8º BPM DOA MAIS DE 500 MECHAS DE CABELO PARA ENTIDADES | data-filename="retriever" (isolado) | meio |
| 407211 | APLICADAS NA REGIÃO AS PRIMEIRAS DOSES DA VACINA CONTRA A COVID-19 | data-filename="retriever" (isolado) | meio |
| 407182 | COMEÇA A COLHEITA DO ARROZ NO RIO GRANDE DO SUL | data-filename="retriever" (isolado) | meio |
| 407103 | COMUNIDADE DE BARRINHA JÁ TEM NOVO ACESSO LIBERADO | style="width: 50%..." (isolado) | fim |
| 407066 | CÂMARA DE VEREADORES DE SÃO JOÃO DO SUL REALIZA A 1ª SESSÃO EXTRAORDINÁRIA DA NOVA LEGISLATURA | data-filename="retriever" (isolado) | meio |
| 407037 | PITAYA: RENDA EXTRA LONGE DOS AGROTÓXICOS | data-filename="retriever" (isolado) | fim |
| 407029 | EXTREMO SUL DE SC TERMINA 2020 COM SALDO POSITIVO NA GERAÇÃO DE EMPREGOS | data-filename="retriever" (isolado) | meio |
| 406864 | COM A COGESTÃO, TORRES SEGUIRÁ O REGRAMENTO DA BANDEIRA VERMELHA E O DECRETO ESTADUAL OBRIGATÓRIO | data-filename="retriever" (isolado) | fim |
| 406838 | MISSA E ORAÇÃO EM MEMÓRIA AOS 29 ANOS DE FALECIMENTO DO FREI ADERCIDE DOS SANTOS SILVA | data-filename="retriever" (isolado) | meio |
| 406787 | EPAGRI/CIRAM PREVÊ INÍCIO DE MARÇO CHUVOSO EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 406721 | RS/TORRES: DECRETO MUNICIPAL PUBLICADO NESTE DOMINGO SEGUE O ESTADUAL DIVULGADO NA ÚLTIMA SEXTA-FEIRA | style="width: Npx; height: Npx;..." | fim |
| 406667 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 406661 | IBGE ABRE VAGAS PARA O CENSO 2021 | data-filename="retriever" (isolado) | fim |
| 406659 | VEREADORES APROVAM PROJETOS IMPORTANTES PARA O DESENVOLVIMENTO DO MUNICÍPIO DE SÃO JOÃO DO SUL | data-filename="retriever" (isolado) | meio |
| 406646 | HOSPITAIS DA REGIÃO RESTRINGEM ATENDIMENTO DEVIDO AO AUMENTO DE INTERNAÇÕES POR COVID-19 | data-filename="retriever" (isolado) | meio |
| 406577 | GOVERNO DE SC DESCARTA LOCKDOWN E PRETENDE AFROUXAR REGRAS AOS FINAIS DE SEMANA | data-filename="retriever" (isolado) | meio |
| 406561 | MÃE PEDE AJUDA PARA CUSTEIO DE ALIMENTAÇÃO DE FILHAS COM SÍNDROMES RARAS EM SÃO JOÃO DO SUL | data-filename="retriever" (isolado) | meio |
| 406510 | ERRO NO ANDROID MOSTRA AVISO DE 'FALHAS CONTÍNUAS' PARA USUÁRIOS | data-filename="retriever" (isolado) | fim |
| 406505 | GOVERNO DO ESTADO VAI CONCEDER 680 BOLSAS DE PÓS-GRADUAÇÃO EM 2021 COM INVESTIMENTO DE R$ 14,6 MILHÕES | data-filename="retriever" (isolado) | meio |
| 406458 | APAE DE PASSO DE TORRES SEGUE COM ATIVIDADES REMOTAS EM RESPEITO AO DECRETO MUNICIPAL | data-filename="retriever" (isolado) | meio |
| 406404 | SANTA CATARINA GEROU 33.994 VAGAS DE EMPREGOS FORMAIS EM FEVEREIRO | data-filename="retriever" (isolado) | fim |
| 406347 | NOVA RODADA DO AUXÍLIO EMERGENCIAL COMEÇA A SER PAGA HOJE | data-filename="retriever" (isolado) | fim |
| 406277 | GOVERNO DO RS AUTORIZA ABERTURA DO COMÉRCIO NÃO ESSENCIAL E RESTAURANTES AOS FINS DE SEMANA | data-filename="retriever" (isolado) | meio |
| 406241 | RESPIRADORES: MPF ARQUIVA INQUÉRITO CONTRA CARLOS MOISÉS | data-filename="retriever" (isolado) | fim |
| 406212 | SECRETARIA DE SAÚDE JÁ APLICOU MAIS DE MIL DOSES DA VACINA CONTRA A COVID-19 EM SÃO JOÃO DO SUL | style="width: 50%..." (isolado) | fim |
| 406153 | SINE DE SANTA CATARINA OFERECE MAIS DE 4,6 MIL VAGAS DE EMPREGO NESTA SEMANA | data-filename="retriever" (isolado) | meio |
| 406029 | PREFEITO VALMIR RODRIGUES FAZ AVALIAÇÃO DOS PRIMEIROS 04 MESES DE GOVERNO EM PASSO DE TORRES | data-filename="retriever" (isolado) | fim |
| 405813 | GOVERNO DO ESTADO INVESTE MAIS DE R$ 243,5 MILHÕES EM AÇÕES CONTRA A ESTIAGEM EM SC | data-filename="retriever" (isolado) | fim |
| 405793 | INSS ANTECIPARÁ R$ 25,3 BILHÕES DE DÉCIMO-TERCEIRO A 31 MILHÕES DE BENEFICIÁRIOS | data-filename="retriever" (isolado) | fim |
| 405626 | DEFESA CIVIL DO ESTADO CONFIRMA PASSAGEM DE TORNADO EM CAMPOS NOVOS | data-filename="retriever" (isolado) | meio |
| 405546 | EMPRESÁRIO DE SÃO JOÃO DO SUL MORRE EM ACIDENTE EM PRAIA GRANDE | style="width: 50%..." (isolado) | fim |
| 405417 | ATIVIDADE ECONÔMICA DE SC CRESCEU 16,8% EM ABRIL, DIZ BC | data-filename="retriever" (isolado) | fim |
| 405304 | GOVERNO RECEBE MAIS 309 MIL DOSES E REFORÇA PEDIDO PARA QUE POPULAÇÃO TOME AS DUAS DOSES DA VACINA | data-filename="retriever" (isolado) | meio |
| 405297 | GOVERNO DE SC PREPARA TERRENO PARA REFORMA DA PREVIDÊNCIA E TENTA EVITAR DESGASTE POLÍTICO | data-filename="retriever" (isolado) | meio |
| 405256 | SANTA ROSA DO SUL: ADMINISTRAÇÃO MUNICIPAL PAGA PRIMEIRA PARCELA DO 13° SALÁRIO | data-filename="retriever" (isolado) | fim |
| 405178 | CONGELAMENTO DA PISTA FECHA TRÁFEGO NA SERRA DO RIO DO RASTRO | data-filename="retriever" (isolado) | meio |
| 405099 | CRIANÇA NA GELADEIRA PARA ENFRENTAR CALOR DE 50°C | data-filename="retriever" (isolado) | meio |
| 405087 | SC TEM MAIS DE 860 MIL ELEITORES FILIADOS A PARTIDOS POLÍTICOS; VEJA LISTA | data-filename="retriever" (isolado) | fim |
| 405058 | GOVERNO DE SC INVESTE 17% DO QUE DEVERIA NA MANUTENÇÃO DE RODOVIAS, APONTA ESTUDO | data-filename="retriever" (isolado) | meio |
| 404956 | PREFEITO E EX-VEREADORES DE MORRINHOS DO SUL VIAJAM A PORTO ALEGRE EM BUSCA DE RECURSOS | data-filename="retriever" (isolado) | meio |
| 404932 | ESTUDANTES AGRADECEM AO GOVERNO DO ESTADO POR INVESTIMENTOS HISTÓRICOS EM BOLSAS DE ENSINO SUPERIOR | data-filename="retriever" (isolado) | meio |
| 404876 | APAE SEGUE NA BUSCA DE RECURSOS PARA CONSTRUÇÃO DA SEDE PRÓPRIA EM PASSO DE TORRES | data-filename="retriever" (isolado) | fim |
| 404798 | GOVERNO MOBILIZA EQUIPES E REFORÇA ORIENTAÇÕES DE PREVENÇÃO PARA ONDA DE FRIO INTENSO QUE ATINGE O ESTADO NESTA SEMANA | data-filename="retriever" (isolado) | meio |
| 404779 | SANTA CATARINA REGISTRA TEMPERATURAS NEGATIVAS E FRIO SEGUE INTENSO COM POSSIBILIDADE DE NEVE | data-filename="retriever" (isolado) | meio |
| 404698 | RS: COM CONTENÇÃO NOS GASTOS E MAIOR ARRECADAÇÃO, ESTADO ACUMULA SUPERÁVIT DE R$ 2,8 BILHÕES ATÉ JUNHO | data-filename="retriever" (isolado) | fim |
| 404663 | EMPRESA GAÚCHA DE RODOVIAS ALTERA CÁLCULO DAS TARIFAS DE PEDÁGIO | data-filename="retriever" (isolado) | fim |
| 404582 | IFSC OBTÉM PATENTE INDUSTRIAL DE PLATAFORMA PARA ESTUDANTES CADEIRANTES | data-filename="retriever" (isolado) | fim |
| 404569 | COVID EM SC: MÉDIA MÓVEL DE CASOS TEM QUEDA DE 14% EM UMA SEMANA | style="width: 50%..." (isolado) | meio |
| 404546 | PPA 2022/2025 É APRESENTADO PARA APRECIAÇÃO NA CÂMARA DE VEREADORES DE SÃO JOÃO DO SUL | data-filename="retriever" (isolado) | meio |
| 404525 | APAES PROMOVEM AÇÕES NO MÊS DE PREVENÇÃO AS DEFICIÊNCIAS | data-filename="retriever" (isolado) | meio |
| 404461 | AUTORIDADES E EMPRESÁRIOS BUSCAM MELHORIAS PARA SEGURANÇA PÚBLICA DE SÃO JOÃO DO SUL | data-filename="retriever" (isolado) | meio |
| 404310 | COOPERJA COMPLETA 52 ANOS COM INAUGURAÇÃO HISTÓRICA DO MAIS MODERNO PARQUE INDUSTRIAL DO SUL DO BRASIL | data-filename="retriever" (isolado) | meio |
| 404231 | TORRES SEDIA PELA PRIMEIRA VEZ O CAMPEONATO BRASILEIRO DE BALONISMO | data-filename="retriever" (isolado) | fim |
| 404172 | TRILHAS E AVENTURAS EM MORRINHOS DO SUL | data-filename="retriever" (isolado) | meio |
| 404139 | GOVERNO DO RS ANUNCIA AVANÇOS HISTÓRICOS COM A LOA 2022 E REAFIRMA FIM DAS ALÍQUOTAS MAJORADAS DE ICMS | data-filename="retriever" (isolado) | meio |
| 404094 | DEMORA NA REVITALIZAÇÃO DA SEDE DA CÂMARA GERA QUESTIONAMENTO EM MAMPITUBA | data-filename="retriever" (isolado) | meio |
| 404022 | MUNICÍPIO DE PASSO DE TORRES COMPLETA 30 ANOS DE EMANCIPAÇÃO POLÍTICA | data-filename="retriever" (isolado) | fim |
| 403832 | NO SUL, GOVERNADOR AUTORIZA MAIS DE R$ 28,7 MILHÕES PARA INSTITUIÇÕES ESPECIALIZADAS EM EDUCAÇÃO ESPECIAL | data-filename="retriever" (isolado) | meio |
| 403815 | SINE DE SANTA CATARINA ESTÁ COM QUASE 9 MIL VAGAS DE EMPREGO ABERTAS | data-filename="retriever" (isolado) | meio |
| 403804 | FAPESC E CORPO DE BOMBEIROS BUSCAM APRIMORAR TREINAMENTO DE RESGATE | data-filename="retriever" (isolado) | meio |
| 403787 | GOVERNADOR LIBERA R$ 2,4 MILHÕES PARA CONSTRUÇÃO DA SEDE DA APAE EM PASSO DE TORRES | data-filename="retriever" (isolado) | meio |
| 403704 | SC MAIS MORADIA: GOVERNO LANÇA PROGRAMA PARA COMBATER DÉFICIT HABITACIONAL | data-filename="retriever" (isolado) | meio |
| 403633 | GOVERNO DO RS JÁ ANUNCIOU QUASE R$ 3,4 BILHÕES EM INVESTIMENTOS NO AVANÇAR | data-filename="retriever" (isolado) | meio |
| 403625 | UNIDADES DO IGP DE SANTA CATARINA RECEBEM VIATURAS E 434 NOVOS COMPUTADORES | data-filename="retriever" (isolado) | meio |
| 403585 | PRAIA GRANDE: GRAXA SEGUROS E IMOBILIÁRIA EM NOVO ENDEREÇO | data-filename="retriever" (isolado) | fim |
| 403525 | GOVERNO DO ESTADO DEFINE PROJETO ARQUITETÔNICO DO PMI PARA O COMPLEXO TURÍSTICO DA SERRA DO RIO DO RASTRO | data-filename="retriever" (isolado) | meio |
| 403523 | QUINA TERÁ NOVA REGRA DE PREMIAÇÃO E PROMETE PRÊMIOS MAIORES | data-filename="retriever" (isolado) | meio |
| 403378 | PRIMEIRO DIA DO ENEM TERÁ PROVA DE REDAÇÃO | style="width: 50%..." (isolado) | meio |
| 403375 | CAIXA INICIA PAGAMENTO DO AUXÍLIO BRASIL | style="width: 50%..." (isolado) | meio |
| 403315 | PRAIA GRANDE REALIZA ABERTURA DO 12° NATAL DOS CANYONS NA NOITE DESTE SÁBADO (20) | style="width: 50%..." (isolado) | meio |
| 403292 | CCR VIACOSTEIRA APOIA A CAMPANHA NOVEMBRO AZUL | style="width: 50%..." (isolado) | fim |
| 403288 | ENEM COMEÇA A SER APLICADO HOJE EM 1,7 MIL CIDADES | style="width: 50%..." (isolado) | meio |
| 403217 | NOVOS PADRES ASSUMEM NESTE SÁBADO (27) NAS PARÓQUIAS SÃO JOÃO BATISTA E SÃO SEBASTIÃO | style="width: Npx; height: Npx;..." | fim |
| 403194 | COM INVESTIMENTOS DE MAIS DE R$ 90 MILHÕES, CARLOS MOISÉS AUTORIZA OBRAS DE INFRAESTRUTURA PARA O SUL E O EXTREMO SUL | style="width: Npx; height: Npx;..." | meio |
| 403163 | SÃO JOÃO DO SUL: CHEGAM AS COMEMORAÇÕES DO MÊS MAIS ILUMINADO E ENCANTADOR DO ANO | style="width: Npx; height: Npx;..." | meio |
| 403130 | PROGRAMA ZERA DÍVIDA DA CASAN PROSSEGUE ATÉ 10 DE JANEIRO | style="width: Npx; height: Npx;..." | fim |
| 403114 | CORONEL MARCOS AURÉLIO BARCELOS ASSUME O COMANDO-GERAL DO CORPO DE BOMBEIROS MILITAR | style="width: 50%..." (isolado) | meio |
| 403056 | INVESTIMENTO RECORDE NO ENSINO SUPERIOR É DESTAQUE DE REUNIÃO ENTRE GOVERNADOR E REITORES DO SISTEMA ACAFE | style="width: 50%..." (isolado) | meio |
| 403040 | RECICLA CDL ACONTECE NESTE SÁBADO (18) EM SÃO JOÃO DO SUL | style="width: 50%..." (isolado) | fim |
| 403037 | ASSINADO CONVÊNIO PARA RECUPERAÇÃO DA PONTE DE ACESSO A PASSO DE TORRES | style="width: 50%..." (isolado) | fim |
| 403035 | IBGE ABRE AS INSCRIÇÕES PARA OS PROCESSOS SELETIVOS PARA CONTRATAÇÃO DE PESSOAL PARA O CENSO 2022 | style="width: 50%..." (isolado) | meio |
| 402985 | CEPRAG INVESTE FORTE PARA GARANTIR ENERGIA DE QUALIDADE NAS PRAIAS | style="width: 50%..." (isolado) | meio |
| 402862 | VERÃO MAIS SEGURO: ARENAS ENTREGUES PELA FESPORTE MOVIMENTAM O LITORAL CATARINENSE | style="width: Npx; height: Npx;..." | meio |
| 402859 | EM 2021, SANTA CATARINA REGISTRA MENOR ÍNDICE DE CRIMES VIOLENTOS EM 14 ANOS | style="width: 50%..." (isolado) | meio |
| 402857 | IPVA COBRADO EM SANTA CATARINA NÃO SOFRE REAJUSTE E SEGUE SENDO UM DOS MAIS BAIXOS DO PAÍS | style="width: 50%..." (isolado) | meio |
| 402836 | CRIAÇÃO DO BOLSA ATLETA REFORÇA EXPECTATIVAS E TRABALHO DA FUNDAÇÃO CATARINENSE DE EDUCAÇÃO ESPECIAL | style="width: 50%..." (isolado) | meio |
| 402736 | MOACIR SOPELSA É O NOVO PRESIDENTE DA ALESC | style="width: 50%..." (isolado) | meio |
| 402626 | ARENAS DE VERÃO MOVIMENTAM O LITORAL DE SANTA CATARINA | style="width: 50%..." (isolado) | meio |
| 402539 | EM CRICIÚMA, CARLOS MOISÉS AUTORIZA INÍCIO DE OBRA DO PLANO 1000 E REPASSE PARA PAVIMENTAÇÃO DE RODOVIAS | style="width: 50%..." (isolado) | meio |
| 402513 | EQUIPE DO CBMSC LOCALIZA 10 VÍTIMAS ENTRE OS ESCOMBROS EM PETRÓPOLIS | style="width: 50%..." (isolado) | meio |
| 402454 | MUNICÍPIO DE SÃO JOÃO DO SUL HOMOLOGA O CONSELHO MUNICIPAL DE TURISMO - COMTUR | style="width: Npx; height: Npx;..." | meio |
| 402416 | FESTIVAL DE DANÇA DE JOINVILLE TEM BASE DA PROGRAMAÇÃO DEFINIDA PARA A 39ª EDIÇÃO | style="width: 50%..." (isolado) | fim |
| 402403 | BOLETIM ECONÔMICO DE MARÇO DESTACA CRESCIMENTO DO PIB CATARINENSE EM 2021 | style="width: Npx; height: Npx;..." | meio |
| 402321 | FAPESC SELECIONA BOLSISTAS PARA ATUAR COM GERAÇÃO DE DADOS E INOVAÇÃO NO AGRONEGÓCIO | style="width: Npx; height: Npx;..." | fim |
| 402299 | GOVERNO DO ESTADO ENTREGA MAIS 23 ÔNIBUS PARA TRANSPORTE ESCOLAR EM MUNICÍPIOS CATARINENSES | style="width: 50%..." (isolado) | meio |
| 402178 | RS: PRORROGAÇÃO DE PRAZO DE CNH VENCIDA EM MARÇO DE 2021 TERMINA DIA 31/03 | style="width: 50%..." (isolado) | fim |
| 402055 | MARÇO TEM CHUVAS ACIMA DA MÉDIA HISTÓRICA NA MAIOR PARTE DE SANTA CATARINA, APONTA BOLETIM HIDROMETEOROLÓGICO | style="width: 50%..." (isolado) | meio |
| 401985 | RS: IPVA 2022: FINAIS DE PLACAS 3 E 4 VENCEM HOJE TERÇA (26) | style="width: 50%..." (isolado) | meio |
| 401840 | PREFEITO MOACIR TEIXEIRA VISITA OBRAS RECÉM CONCLUÍDAS NO MUNICÍPIO DE SÃO JOÃO DO SUL | style="width: Npx; height: Npx;..." | fim |
| 401814 | GOVERNO DO ESTADO LANÇA PROGRAMA QUALIFICA SC QUE CAPACITARÁ 5 MIL TRABALHADORES PARA O MERCADO FORMAL | style="width: 50%..." (isolado) | meio |
| 401801 | RS: DEFESA CIVIL EMITE ALERTA PARA OS EFEITOS DA TEMPESTADE SUBTROPICAL NO ESTADO | style="width: 50%..." (isolado) | meio |
| 401730 | RS: PLANO DE RECUPERAÇÃO FISCAL GAÚCHO É APROVADO PELO MINISTÉRIO DA ECONOMIA | style="width: 50%..." (isolado) | meio |
| 401689 | GOVERNO DO ESTADO INVESTE R$ 8,57 MILHÕES PARA INSTALAR LOUSAS DIGITAIS EM TODAS AS SALAS DE ENSINO MÉDIO DE 36 ESCOLAS | style="width: 50%..." (isolado) | meio |
| 401685 | COM MELHOR RESULTADO DA HISTÓRIA, CONTAS DO GOVERNO DE SC SÃO APROVADAS POR UNANIMIDADE E SEM RESSALVAS | style="width: 50%..." (isolado) | meio |
| 401667 | SUCESSO NA VII FEIRA DO LIVRO DE PRAIA GRANDE | style="width: 50%..." (isolado) | meio |
| 401648 | SANTA CATARINA TEM O MENOR NÚMERO DE HOMICÍDIOS NO MÊS DE MAIO DESDE 2008 | style="width: 50%..." (isolado) | meio |
| 401551 | PLANO DE RECUPERAÇÃO FISCAL GAÚCHO FOI HOMOLOGADO PELO PRESIDENTE DA REPÚBLICA | style="width: 50%..." (isolado) | meio |
| 401549 | NO SUL DO ESTADO, REVITALIZAÇÃO DA RODOVIA JORGE LACERDA TRAZ MAIS SEGURANÇA A MORADORES E MOTORISTAS | style="width: 50%..." (isolado) | meio |
| 401545 | GOVERNADOR LIBERA RECURSOS PARA PAVIMENTAÇÕES E INAUGURA REVITALIZAÇÃO DO ACESSO A SANGÃO | style="width: 50%..." (isolado) | meio |
| 401486 | GOVERNADOR RESSALTA INVESTIMENTO HISTÓRICO EM EDUCAÇÃO ESPECIAL NA ABERTURA DA 22ª OLIMPÍADA DAS APAES | style="width: 50%..." (isolado) | meio |
| 401430 | GOVERNO DO ESTADO DÁ INÍCIO A PROCESSO DE CONSTRUÇÃO DE SEDE PRÓPRIA DO INSTITUTO DE CARDIOLOGIA | style="width: 50%..." (isolado) | meio |
| 400424 | GOVERNO DO ESTADO INVESTE R$ 65,3 MILHÕES PARA FORTALECER A AGRICULTURA FAMILIAR | style="width: 50%..." (isolado) | meio |
| 400409 | CONCURSO DA EPAGRI TEM INSCRIÇÕES ABERTAS: CONFIRA O EDITAL | style="width: Npx; height: Npx;..." | fim |
| 400387 | PAPAI NOEL CHEGA AO MUNICÍPIO DE PRAIA GRANDE HOJE, 25 DE NOVEMBRO | style="width: 50%..." (isolado) | fim |
| 418339 | VEJA AS REGRAS PARA RETORNO DO PÚBLICO AOS ESTÁDIOS DE FUTEBOL EM SC | data-filename="retriever" (isolado) | fim |
| 418325 | BOLSA ATLETA VIRA LEI E VAI ATENDER MAIS DE 1000 ATLETAS EM SANTA CATARINA | style="width: 50%..." (isolado) | meio |
| 418316 | CAMPEONATO PRAIANO DE BEACH SOCCER 2022 COMEÇA EM TORRES NO PRÓXIMO SÁBADO | style="width: Npx; height: Npx;..." | fim |
| 419066 | BRIGADA MILITAR DE TORRES APONTA REDUÇÃO EM DIVERSOS INDICADORES DE CRIMINALIDADE NO 1º TRIMESTRE DO ANO DE 2021 | data-filename="retriever" (isolado) | fim |
| 418997 | QUATRO PESSOAS INDICIADAS POR EXTORSÕES SEXUAIS POR MEIO CIBERNÉTICO EM CRICIÚMA | data-filename="retriever" (isolado) | meio |
| 419412 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 417323 | SAIBA QUAIS SERÃO OS PRIMEIROS GRUPOS A RECEBER A VACINA CONTRA COVID-19 EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 417297 | RS: LOTE COM 116 MIL DOSES DE VACINA CONTRA A COVID-19 CHEGA AO RS E COMEÇA A SER DISTRIBUÍDO | data-filename="retriever" (isolado) | meio |
| 417276 | UM EM CADA QUATRO CATARINENSES DIZ QUE NÃO TOMARÁ VACINA | data-filename="retriever" (isolado) | meio |
| 417275 | VACINAÇÃO EM SC: ESTADO INICIA DISTRIBUIÇÃO DE 71 MIL DOSES DE CORONAVAC PARA CENTRAIS REGIONAIS | data-filename="retriever" (isolado) | meio |
| 417271 | VACINAÇÃO EM SC: ESTADO RECEBE MAIS 85 MIL DOSES E PODE COMEÇAR IMUNIZAÇÃO CONTRA COVID-19 EM IDOSOS ACIMA DE 90 ANOS | data-filename="retriever" (isolado) | meio |
| 417253 | BRASIL REGISTRA 1.308 MORTES POR COVID-19 NESTA SEXTA-FEIRA | data-filename="retriever" (isolado) | meio |
| 417247 | COVID-19: BRASIL REGISTROU 57.472 CASOS EM 24 HORAS | data-filename="retriever" (isolado) | meio |
| 417240 | COVID: QUATRO REGIÕES DE SC ESTÃO HÁ MAIS DE 50 DIAS EM RISCO GRAVÍSSIMO | data-filename="retriever" (isolado) | fim |
| 417199 | PASSO DE TORRES PERMANECE EM LOCKDOWN DURANTE O FIM DE SEMANA | data-filename="retriever" (isolado) | fim |
| 417163 | COM SUPERLOTAÇÃO, DIREÇÃO DO HOSPITAL NOSSA SENHORA DE FÁTIMA EMITE NOTA URGENTE À POPULAÇÃO | data-filename="retriever" (isolado) | fim |
| 417147 | FUNCIONÁRIOS DA SAÚDE PROMOVEM UM MINUTO DE SILÊNCIO PELAS VIDAS PERDIDAS PARA O COVID-19 EM PASSO DE TORRES | data-filename="retriever" (isolado) | fim |
| 417127 | COVID EM SC: CONSUMO DE OXIGÊNIO CRESCEU ATÉ 167% EM MARÇO | data-filename="retriever" (isolado) | meio |
| 417100 | RS: PESSOAS COM COMORBIDADES SERÃO AS PRÓXIMAS A RECEBER VACINA CONTRA COVID-19 NO ESTADO | data-filename="retriever" (isolado) | fim |
| 417096 | RIO GRANDE DO SUL RECEBE REMESSA DE 441.550 VACINAS CONTRA A COVID-19 | data-filename="retriever" (isolado) | meio |
| 417067 | COVID: SC TEM FILA POR UTI DE 29 PACIENTES | data-filename="retriever" (isolado) | fim |
| 417064 | SECRETARIA DE SAÚDE CONFIRMA 14º ÓBITO POR COVID-19 EM SÃO JOÃO DO SUL | outro: style="width: 25%; float: right;" | meio |
| 417021 | RS: SECRETARIA DA SAÚDE E COSEMS ESTIMAM VACINAR ATÉ SETEMBRO, COM PRIMEIRA DOSE, TODA A POPULAÇÃO DE 18 ANOS PARA CIMA | data-filename="retriever" (isolado) | meio |
| 417019 | GOVERNO DE SC PROJETA VACINAR TODOS OS CATARINENSES ACIMA DE 18 ANOS ATÉ OUTUBRO | data-filename="retriever" (isolado) | meio |
| 417014 | SC ACELERA PRIMEIRA APLICAÇÃO DA VACINA; DOSE DE REFORÇO EMPACA | data-filename="retriever" (isolado) | fim |
| 417009 | BRASIL REGISTRA MAIS DE 500 MIL MORTOS POR COVID-19 | data-filename="retriever" (isolado) | meio |
| 416997 | VACINAS DA JANSSEN CHEGAM AO RS E SERÃO DISTRIBUÍDAS NA SEGUNDA, DIA 05 | data-filename="retriever" (isolado) | meio |
| 416939 | ESTADO ULTRAPASSA 6 MILHÕES DE DOSES APLICADAS CONTRA A COVID-19 | data-filename="retriever" (isolado) | meio |
| 416932 | ESTADO ATINGE 80% DA POPULAÇÃO ADULTA VACINADA COM A PRIMEIRA DOSE CONTRA A COVID-19 | data-filename="retriever" (isolado) | meio |
| 416924 | INSATISFEITA, SECRETARIA DE ESTADO DA SAÚDE 'DEDURA' PREFEITURAS POR ATRASO NA VACINAÇÃO | data-filename="retriever" (isolado) | fim |
| 416866 | GOVERNO DO ESTADO INVESTE CERCA DE R$ 1 BILHÃO EM CONVÊNIOS PARA A SAÚDE | data-filename="retriever" (isolado) | fim |
| 416813 | SANTA CATARINA É DESTAQUE EM CIRURGIAS ELETIVAS E SUPERA EM 350% OS ESTADOS DO SUL | style="width: 50%..." (isolado) | meio |
| 416792 | EM BLUMENAU, É INAUGURADO UM DOS MELHORES CENTROS DE ALTA COMPLEXIDADE RENAL DO SUL DO BRASIL | style="width: 50%..." (isolado) | meio |
| 416789 | VACINAS DA GRIPE E SARAMPO TÊM BAIXA PROCURA EM SANTA CATARINA | style="width: 50%..." (isolado) | meio |
| 416780 | SES AMPLIA VACINAÇÃO CONTRA GRIPE E SARAMPO ATÉ INÍCIO DE JUNHO, QUANDO DOSES SERÃO LIBERADAS A TODOS | style="width: Npx; height: Npx;..." | meio |
| 420099 | SC LIDERA RANKING DE ESTADO 'MAIS FELIZ' DO PAÍS | data-filename="retriever" (isolado) | fim |
| 420269 | ONDA DE FRIO CAUSA PREJUÍZOS NAS LAVOURAS DE BANANA, HORTIGRANJEIROS E FUMO | data-filename="retriever" (isolado) | meio |
| 420049 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | fim |
| 420040 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 420033 | COLUNA POLÍTICA - POR RONI RAUPP | style="width: Npx; height: Npx;..." | meio |
| 420028 | COLUNA POLÍTICA - POR RONI RAUPP | style="width: Npx; height: Npx;..." | fim |

## 7. Checagem preventiva nos caches antigos (somente leitura, sem refetch)

Pedido explícito da revisão: repetir a mesma varredura de leitura nos lotes já concluídos, se o cache local ainda existir.

| Lote | Cache local existe? | Artigos em cache | Casos do padrão |
|---|---|---|---|
| 2015-2016 | Sim | 1.635 | **0** |
| 2017-2018 | Sim | 2.511 | **0** |
| 2019-2020 | Sim | 5.100 | **203** |

**2019-2020 já está importado em produção** (5.088 articles, `legacy_migration_batches.status = complete`). Os 203 casos identificados (mesma assinatura, 100% coberta pela mesma regra de sanitização, 0 falso-positivo nos 4.897 artigos restantes do lote) representam o mesmo tipo de resíduo mecânico, agora presente em dados **já publicados**.

**Nenhuma ação foi tomada sobre esses 203 registros nesta etapa** — nem no cache local, nem no banco de dados. Isso fica registrado como achado pendente de decisão explícita (provavelmente um `UPDATE` pontual de `body`/`body_html` desses 203 `articles` já publicados, análogo à sanitização aplicada ao cache de 2021-2022, mas exigindo autorização explícita antes de tocar em dados de produção).

### Lista completa dos 203 casos (2019-2020) — NÃO alterados, apenas identificados

| external_id | Título | Assinatura | Posição |
|---|---|---|---|
| 418269 | COVID-19: MORTES SOMAM 359 E INFECTADOS SÃO 9 MIL NO BRASIL | data-filename="retriever" (isolado) | meio |
| 418260 | HOSPITAL DE OSÓRIO RECEBE 10 LEITOS DE UTI PARA AMPLIAR ATENDIMENTO À COVID-19 | data-filename="retriever" (isolado) | meio |
| 420331 | COLHEITA DO ARROZ NO RS PERTO DE 60% | data-filename="retriever" (isolado) | meio |
| 420322 | ARGENTINA COLOCA FRONTEIRA GAÚCHA EM ATENÇÃO POR NUVEM DE GAFANHOTOS | data-filename="retriever" (isolado) | meio |
| 420081 | COLUNA POLÍTICA - POR RONI RAUPP | style="width: Npx; height: Npx;..." | meio |
| 420080 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 420079 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 420069 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | fim |
| 420068 | COLUNA POLÍTICA - POR RONI RAUPP | data-filename="retriever" (isolado) | meio |
| 410667 | PREFEITURA DE PRAIA GRANDE DETERMINA O FECHAMENTO DAS FRONTEIRAS DA CIDADE | style="width: 50%..." (isolado) | fim |
| 410663 | PUBLICADO DECRETO DETERMINANDO FECHAMENTO DO COMÉRCIO E OUTRAS MEDIDAS EM TORRES | style="width: Npx; height: Npx;..." | fim |
| 410657 | SITUAÇÃO DE EMERGÊNCIA É DECRETADA EM MORRINHOS DO SUL | style="width: Npx; height: Npx;..." | meio |
| 410632 | PREFEITO JONAS DECRETA FECHAMENTO DOS PRINCIPAIS ACESSOS DE PASSO DE TORRES | style="width: 50%..." (isolado) | meio |
| 410626 | PRAIA GRANDE TEM 02 CASOS SUSPEITOS E 07 EM MONITORAMENTO | data-filename="retriever" (isolado) | fim |
| 410619 | DECRETO 44/20: RESTRINGE ACESSO À CIDADE DE TORRES A PARTIR DESTA SEXTA-FEIRA (20) | style="width: 50%..." (isolado) | fim |
| 410599 | SECRETARIA DE SAÚDE DE PASSO DE TORRES DIVULGA CRONOGRAMA DE VACINAS CONTRA A GRIPE H1N1 | style="width: Npx; height: Npx;..." | fim |
| 410549 | PODER EXECUTIVO DE MAMPITUBA DECRETA 'ESTADO DE CALAMIDADE PÚBLICA' DEVIDO O NOVO CORONAVÍRUS | style="width: 50%..." (isolado) | meio |
| 410505 | HOSPITAL NOSSA SENHORA DE FÁTIMA PEDE DOAÇÕES PARA ADQUIRIR MAIS RESPIRADORES | style="width: 50%..." (isolado) | fim |
| 410501 | CORONAVÍRUS: BRASIL TEM 92 MORTES E 3,4 MIL CASOS CONFIRMADOS | data-filename="retriever" (isolado) | meio |
| 410486 | BRASIL TEM 3.904 CASOS E 114 MORTES POR COVID-19 | style="width: 50%..." (isolado) | meio |
| 410434 | UNESC TRABALHA NA PRODUÇÃO DE RESPIRADORES MECÂNICOS PARA AUXILIAR SERVIÇOS DE SAÚDE | style="width: Npx; height: Npx;..." | meio |
| 410391 | PAÍS TEM 201 MORTES POR COVID-19 E 5.717 CASOS CONFIRMADOS | data-filename="retriever" (isolado) | meio |
| 410363 | NÚMERO DE CASOS DE COVID-19 NO BRASIL CHEGA A 6.836 E MORTES SOMAM 241 | data-filename="retriever" (isolado) | meio |
| 410264 | LEITE REDUZIRÁ PRÓPRIO SALÁRIO EM 30% NOS PRÓXIMOS TRÊS MESES | data-filename="retriever" (isolado) | meio |
| 410226 | EM 30 DIAS DE CRISE, INDÚSTRIA DE SC DEMITIU 165 MIL TRABALHADORES | data-filename="retriever" (isolado) | fim |
| 410022 | GOVERNO DO ESTADO INVESTE NA COMPRA DE PRODUTOS DA AGRICULTURA FAMILIAR | data-filename="retriever" (isolado) | meio |
| 409971 | HOMENS GANHARAM QUASE 30% A MAIS QUE AS MULHERES EM 2019 | data-filename="retriever" (isolado) | meio |
| 409944 | CAMINHONEIROS FORAM VACINADOS CONTRA A GRIPE EM UNIDADES DA PRF NO RS | data-filename="retriever" (isolado) | meio |
| 409904 | GOVERNO PRORROGA PARCELA DE TRIBUTOS QUE VENCEM EM MAIO, JUNHO E JULHO | style="width: 50%..." (isolado) | fim |
| 409778 | SANTA CATARINA OFERTA VACINA MENINGOCÓCICA ACWY NOS POSTOS DE SAÚDE | data-filename="retriever" (isolado) | fim |
| 409664 | PRESIDÊNCIA DA ALESC SE MANIFESTA APÓS POLÊMICA COM JESSÉ LOPES | style="width: 50%..." (isolado) | meio |
| 409634 | COOPERAÇÃO ENTRE ESTADO E MUNICÍPIOS MELHORA PRESERVAÇÃO DA MATA ATLÂNTICA NO RS | data-filename="retriever" (isolado) | meio |
| 409632 | SANTA CATARINA REDUZIU DESMATAMENTO EM 22%, APONTA ATLAS DA MATA ATLÂNTICA | data-filename="retriever" (isolado) | meio |
| 409577 | GOVERNO DO ESTADO DEFINE NOVO CRONOGRAMA DE FUNCIONAMENTO DE TRANSPORTE E EDUCAÇÃO | data-filename="retriever" (isolado) | fim |
| 409471 | GOVERNADOR ASSINA CONVÊNIO DE R$ 15,8 MILHÕES PARA CONSTRUÇÃO DE PONTE SOBRE O RIO ARARANGUÁ | data-filename="retriever" (isolado) | meio |
| 409415 | SICOOB CREDISULCA LANÇA SITE PARA A 3ª EDIÇÃO DO CONCURSO DE FOTOGRAFIA FOCO NO COOPERATIVISMO | style="width: 50%..." (isolado) | meio |
| 409286 | AUMENTO DE LEITOS DE UTI PARA ATENDIMENTO NO SUS DEVERÁ ULTRAPASSAR 100% NO RS | data-filename="retriever" (isolado) | fim |
| 409247 | CICLONE BOMBA IMPACTARÁ O SUL E O SUDESTE DO BRASIL | data-filename="retriever" (isolado) | meio |
| 409197 | GOVERNO DE SANTA CATARINA DECRETA CALAMIDADE PÚBLICA POR DANOS CAUSADOS POR EVENTO CLIMÁTICO | data-filename="retriever" (isolado) | meio |
| 409193 | CHEGADA DE RECURSOS POSSIBILITAM INVESTIMENTOS NA ASSOCIAÇÃO HOSPITALAR NOSSA SENHORA DE FÁTIMA EM PRAIA GRANDE | data-filename="retriever" (isolado) | meio |
| 409144 | FATURAMENTO COM EXPORTAÇÕES EM SC CAIU 12,2% NO PRIMEIRO SEMESTRE | data-filename="retriever" (isolado) | fim |
| 409122 | ZÉ MILTON LEVANTA DADOS DOS ESTRAGOS DO 'CICLONE BOMBA' NA AGRICULTURA PARA APRESENTAR PROPOSTAS DE APOIO AO SETOR | data-filename="retriever" (isolado) | fim |
| 409121 | CICLONE EM SC: ESTADO CONTABILIZA PREJUÍZOS DE R$ 277,8 MILHÕES | data-filename="retriever" (isolado) | fim |
| 409080 | RS: APÓS QUEDA EXPRESSIVA EM ABRIL, MORTES NO TRÂNSITO VOLTAM A CRESCER | data-filename="retriever" (isolado) | meio |
| 409030 | GOVERNO DO ESTADO AMPLIA EM QUASE 70% OS INVESTIMENTOS E APLICA R$ 18,8 MILHÕES EM CONSERVAÇÃO DE RODOVIAS EM 2020 | data-filename="retriever" (isolado) | fim |
| 409019 | TECNOLOGIA DA EPAGRI PARA SUBSTITUIR ABELHAS RAINHAS PODE AUMENTAR PRODUÇÃO DE MEL EM ATÉ 200% | data-filename="retriever" (isolado) | meio |
| 409001 | CAMPEONATO CATARINENSE VOLTA NO DIA 28, COM NOVO PROTOCOLO DE SAÚDE | data-filename="retriever" (isolado) | meio |
| 408990 | ATIVIDADE ECONÔMICA DE SC CRESCEU 3,52% EM MAIO, SEGUNDO BC | data-filename="retriever" (isolado) | fim |
| 408932 | NOVO DECRETO SUSPENDE TRANSPORTE COLETIVO E PERMANÊNCIA EM ESPAÇOS PÚBLICOS EM 111 MUNICÍPIOS CATARINENSES | data-filename="retriever" (isolado) | meio |
| 408859 | MPF PEDE DEMOLIÇÃO DE POUSADA CONSTRUÍDA IRREGULARMENTE NO MORRO DOS CONVENTOS, EM ARARANGUÁ | data-filename="retriever" (isolado) | fim |
| 408828 | DOMINGO TERÁ FENÔMENO ASTRONÔMICO ANTES DO AMANHECER | style="width: 50%..." (isolado) | meio |
| 408816 | MUNICÍPIOS E ASSOCIAÇÕES ENCAMINHAM 49 PEDIDOS DE RECONSIDERAÇÃO AO MAPA PRELIMINAR DA 12ª RODADA | style="width: 50%..." (isolado) | meio |
| 408783 | 18,9% DOS EMPRESÁRIOS DE SC PROJETAM INVESTIMENTOS DURANTE A PANDEMIA | data-filename="retriever" (isolado) | meio |
| 408770 | GOVERNADOR CARLOS MOISÉS REPASSA MAIS DE R$ 70 MILHÕES EM EMENDAS PARA 245 MUNICÍPIOS | data-filename="retriever" (isolado) | fim |
| 408747 | PEQUENA ÍSIS COMPLETA 01 ANO DE VIDA E PRECISA DE SUA AJUDA | data-filename="retriever" (isolado) | fim |
| 408618 | PREFEITURA DE TORRES DECRETA HORÁRIO DE FUNCIONAMENTO DO COMÉRCIO NÃO ESSENCIAL E RESTAURANTES NA BANDEIRA VERMELHA | data-filename="retriever" (isolado) | meio |
| 408612 | PREFEITO HENRIQUE BUSCA PROJETO AUDACIOSO PARA A CAPITAL DOS CANYONS | data-filename="retriever" (isolado) | fim |
| 408596 | ESCOLA DE EDUCAÇÃO BÁSICA BULCÃO VIANA, DE PRAIA GRANDE, COMPLETA 66 ANOS DE HISTÓRIA | data-filename="retriever" (isolado) | fim |
| 408594 | CRESOL INOVA E TRAZ MÁQUINA DE CARTÃO COM TAXAS DIFERENCIADAS | data-filename="retriever" (isolado) | fim |
| 408590 | DEFESA CIVIL CONFIRMA A PASSAGEM DE TORNADOS EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 408573 | GOVERNO DE SC JÁ REPASSOU R$ 169 MILHÕES EM EMENDAS IMPOSITIVAS DE 2020 | data-filename="retriever" (isolado) | fim |
| 408559 | PRINCIPAIS MUNICÍPIOS DA SERRA GAÚCHA PODEM PERDER R$ 83 MILHÕES COM FIM DAS ALÍQUOTAS MAJORADAS | data-filename="retriever" (isolado) | fim |
| 408541 | IDOSOS REPRESENTAM 11,5% DOS CASOS E 76,8% DOS ÓBITOS POR COVID-19 EM SC | data-filename="retriever" (isolado) | meio |
| 408522 | SANTA CATARINA REGISTRA NEVE E FRIO INTENSO NO AMANHECER DESTA SEXTA-FEIRA | data-filename="retriever" (isolado) | meio |
| 408495 | RS FICA COM 12 REGIÕES EM BANDEIRA VERMELHA NA 16ª RODADA DO DISTANCIAMENTO CONTROLADO | data-filename="retriever" (isolado) | meio |
| 408474 | MORADORES PEDEM FISCALIZAÇÃO EM RIO DE PRAIA GRANDE | data-filename="retriever" (isolado) | fim |
| 408462 | SANTA CATARINA REGISTRA MENOR TAXA DE DESEMPREGO DO PAÍS NO SEGUNDO TRIMESTRE DE 2020 | data-filename="retriever" (isolado) | fim |
| 408452 | ENSINO REMOTO ALCANÇA 96% DOS ALUNOS DA REDE PÚBLICA NO SUL DO BRASIL, APONTA DATAFOLHA | data-filename="retriever" (isolado) | meio |
| 408391 | SETEMBRO AMARELO: CAMPANHA REFORÇA IMPORTÂNCIA DA PREVENÇÃO AO SUICÍDIO | data-filename="retriever" (isolado) | meio |
| 408364 | STR DE SÃO JOÃO DO SUL E PASSO DE TORRES COMPLETA 50 ANOS DE HISTÓRIA | style="width: 50%..." (isolado) | fim |
| 408267 | SINE/SC OFERTA 4 MIL VAGAS DE EMPREGO EM TODAS REGIÕES DO ESTADO | data-filename="retriever" (isolado) | meio |
| 408250 | AÇÕES ONLINE MARCAM A SEMANA NACIONAL DO TRÂNSITO EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 408247 | IMPEACHMENT: NOMES DO TRIBUNAL MISTO SÃO DEFINIDOS; VEJA OS MEMBROS | data-filename="retriever" (isolado) | meio |
| 408243 | CEPRAG COMEMORA MAIS UMA RECERTIFICAÇÃO | data-filename="retriever" (isolado) | fim |
| 408240 | CDL DE SÃO JOÃO DO SUL COMPLETA 25 ANOS DE DEDICAÇÃO AO MOVIMENTO LOJISTA E AO MUNICÍPIO | data-filename="retriever" (isolado) | fim |
| 408225 | EXPOINTER DIGITAL 2020 COMEÇA NESTE SÁBADO COM NOVE DIAS DE INTENSA PROGRAMAÇÃO | data-filename="retriever" (isolado) | meio |
| 408223 | SEGURO DPVAT PREVÊ QUEDA DE QUASE 20% NOS ACIDENTES EM 2020 | style="width: Npx; height: Npx;..." | meio |
| 408169 | SANTA CATARINA TEM SALDO POSITIVO DE 18,3 MIL EMPREGOS EM AGOSTO, MELHOR RESULTADO DO SUL | data-filename="retriever" (isolado) | meio |
| 408158 | CEPRAG OPORTUNIZA CURSOS ON-LINE | data-filename="retriever" (isolado) | fim |
| 408108 | EM 20 MESES, GOVERNO DO ESTADO DESTINOU R$ 2,17 BILHÕES A NOVOS INVESTIMENTOS | data-filename="retriever" (isolado) | meio |
| 408100 | PROGRAMA ENERGIA FORTE NO CAMPO GARANTE R$ 20 MILHÕES PARA MELHORAR REDES DE ENERGIA ELÉTRICA NA ZONA RURAL DO RS | data-filename="retriever" (isolado) | meio |
| 408080 | SECRETARIA DE SAÚDE DE MORRINHOS DO SUL DESENVOLVE AÇÕES EM ALUSÃO AO OUTUBRO ROSA | data-filename="retriever" (isolado) | fim |
| 408030 | VICE-GOVERNADORA ACOMPANHA LANÇAMENTO DA CONCESSÃO DOS PARQUES DE APARADOS DA SERRA E SERRA GERAL | data-filename="retriever" (isolado) | meio |
| 408012 | DIA DOS PROFESSORES EM TEMPOS DE PANDEMIA DO COVID-19 | data-filename="retriever" (isolado) | fim |
| 408000 | BENEFICIÁRIOS DO BOLSA FAMÍLIA RECEBEM 2ª PARCELA DE AUXÍLIO RESIDUAL | data-filename="retriever" (isolado) | fim |
| 407910 | SEGURO DPVAT REGISTRA AUMENTO DE 6% NOS AVISOS DE SINISTRO EM SETEMBRO | data-filename="retriever" (isolado) | fim |
| 407896 | MAIS DE NOVECENTOS MIL PROPRIETÁRIOS DE VEÍCULOS JÁ SOLICITARAM A RESTITUIÇÃO DO SEGURO DPVAT EM TODO BRASIL | data-filename="retriever" (isolado) | meio |
| 407871 | ESTADO TEM MENOR ÍNDICE HISTÓRICO DE MORTES VIOLENTAS | data-filename="retriever" (isolado) | fim |
| 407793 | DIA MUNDIAL EM MEMÓRIA DAS VÍTIMAS DE ACIDENTES DE TRÂNSITO: SEGURO DPVAT JÁ PAGOU MAIS DE 27 MIL INDENIZAÇÕES POR MORTE ESTE ANO | data-filename="retriever" (isolado) | meio |
| 407751 | EDUCAÇÃO: RETORNO DAS ATIVIDADES PRESENCIAIS EM SANTA CATARINA É AUTORIZADO | data-filename="retriever" (isolado) | meio |
| 407739 | GOVERNADORA ABRE EVENTO SOBRE CONTROLE DA FEBRE AFTOSA EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 407711 | MORRE DIEGO MARADONA, AOS 60 ANOS, APÓS PARADA CARDIORRESPIRATÓRIA | data-filename="retriever" (isolado) | meio |
| 407667 | CRICIÚMA (SC) TEM MADRUGADA DE VIOLÊNCIA COM ASSALTO A BANCO | data-filename="retriever" (isolado) | meio |
| 407661 | ARRECADAÇÃO DE IMPOSTOS EM SC CAI 10,5% EM NOVEMBRO | data-filename="retriever" (isolado) | fim |
| 407642 | PREFEITURA DE TORRES PUBLICA DECRETO SOBRE REGRAMENTO EM ESPAÇOS PÚBLICOS | data-filename="retriever" (isolado) | fim |
| 407588 | RS: PAGAMENTO DO IPVA 2021 COM DESCONTO COMEÇA EM 16 DE DEZEMBRO | data-filename="retriever" (isolado) | meio |
| 407574 | SC TEM 14 REGIÕES EM RISCO GRAVÍSSIMO PARA COVID | data-filename="retriever" (isolado) | fim |
| 407554 | PROFESSORA MICHELE DA CUNHA OLIVEIRA LANÇA LIVRO INFANTIL | data-filename="retriever" (isolado) | meio |
| 407456 | ALUNOS DO AEE DE SÃO JOÃO DO SUL RECEBEM ATENDIMENTO MESMO DURANTE A PANDEMIA | data-filename="retriever" (isolado) | meio |
| 407444 | COM A BANDEIRA VERMELHA, PREFEITURA DE TORRES PUBLICA DOIS DECRETOS: REGRAMENTO EM ESPAÇOS PÚBLICOS E SOBRE A COGESTÃO | data-filename="retriever" (isolado) | fim |
| 407432 | JÚPITER E SATURNO EM CONJUNÇÃO HOJE À NOITE | data-filename="retriever" (isolado) | fim |
| 407415 | PREFEITOS, VICE-PREFEITOS E VEREADORES ELEITOS SÃO DIPLOMADOS PELA JUSTIÇA ELEITORAL | data-filename="retriever" (isolado) | meio |
| 407401 | PREFEITO DE PRAIA GRANDE HENRIQUE MACIEL INAUGURA OBRAS IMPORTANTES NO FIM DE SEU GOVERNO | data-filename="retriever" (isolado) | meio |
| 419363 | CORONEL DIONEI TONET SERÁ O NOVO COMANDANTE-GERAL DA POLÍCIA MILITAR DE SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 419351 | ACIDENTES NO TRÂNSITO MATAM MAIS QUE CRIMES VIOLENTOS EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 419342 | PROCURADO PELA JUSTIÇA É PRESO COM PRODUTOS FURTADOS NA BR 101 EM ARARANGUÁ | data-filename="retriever" (isolado) | fim |
| 419337 | DOIS ACIDENTES SÃO ATENDIDOS PELOS BOMBEIROS DE SOMBRIO | data-filename="retriever" (isolado) | meio |
| 419328 | PM DE SANTA CATARINA APREENDE MAIS DE UMA TONELADA DE MACONHA EM APENAS UMA SEMANA | style="width: Npx; height: Npx;..." | meio |
| 419299 | CPI: ACAREAÇÃO CONFRONTA VERSÕES DE SERVIDORA E EX-SECRETÁRIOS | style="width: Npx; height: Npx;..." | meio |
| 419279 | MOISÉS NEGA PARTICIPAÇÃO NA COMPRA DA VEIGAMED E FALA EM 'ILAÇÕES IRRELEVANTES' | style="width: 50%..." (isolado) | fim |
| 419216 | ADVOGADO DE PASSO DE TORRES SOFRE SEQUESTRO RELÂMPAGO | style="width: 50%..." (isolado) | fim |
| 419212 | POLÍCIA CIVIL ESTOURA ABATEDOURO CLANDESTINO DE CAVALOS NO SUL DO ESTADO | style="width: 50%..." (isolado) | fim |
| 419155 | BRIGADA MILITAR DE TORRES APONTA REDUÇÃO EM CINCO INDICADORES DE CRIMINALIDADE NO TERCEIRO TRIMESTRE DE 2020 | data-filename="retriever" (isolado) | fim |
| 419137 | HOMEM É PRESO PELA BM COM CERCA DE 7 MIL PEDRAS DE CRACK EM CAPÃO DA CANOA | data-filename="retriever" (isolado) | fim |
| 419652 | BOLSONARO NOMEIA ANDRÉ MENDONÇA PARA A JUSTIÇA E RAMAGEM PARA A PF | data-filename="retriever" (isolado) | meio |
| 419635 | BOLSONARO VAI COM EMPRESÁRIOS AO STF PARA PEDIR RETOMADA DA ECONOMIA | data-filename="retriever" (isolado) | meio |
| 419616 | PAULINHA PEDE CASSAÇÃO DE JESSÉ LOPES POR QUEBRA DE DECORO | style="width: 50%..." (isolado) | fim |
| 419607 | VEIGAMED PULVERIZOU OS RECURSOS DO ESTADO EM 56 TRANSFERÊNCIAS | data-filename="retriever" (isolado) | meio |
| 419601 | CPI DOS RESPIRADORES OUVE MAIS TRÊS TESTEMUNHAS | style="width: 50%..." (isolado) | meio |
| 419594 | BOLSONARO ANUNCIA CARLOS DECOTELLI COMO NOVO MINISTRO DA EDUCAÇÃO | data-filename="retriever" (isolado) | meio |
| 419577 | IMPEACHMENT: SAIBA MAIS SOBRE O PROCESSO CONTRA O GOVERNADOR E A VICE | data-filename="retriever" (isolado) | meio |
| 419565 | PROGRESSISTAS, PSL E CIDADANIA JUNTOS EM MORRINHOS DO SUL | data-filename="retriever" (isolado) | fim |
| 419560 | EDITAL DE CONVOCAÇÃO PARA CONVENÇÃO MUNICIPAL DO PSDB DE PASSO DE TORRES | data-filename="retriever" (isolado) | meio |
| 419553 | PARTIDO PROGRESSISTA DE PRAIA GRANDE REALIZA CONVENÇÃO MUNICIPAL NO DIA 11 DE SETEMBRO | style="width: Npx; height: Npx;..." | meio |
| 419552 | PSL DE PRAIA GRANDE CONVOCA PARA CONVENÇÃO ELEITORAL NO 12 DE SETEMBRO | style="width: 50%..." (isolado) | meio |
| 419548 | MDB DE PRAIA GRANDE REALIZARÁ CONVENÇÃO DIA 12 | data-filename="retriever" (isolado) | meio |
| 419536 | PL CONFIRMA TONHÃO COMO PRÉ-CANDIDATO A PREFEITO DE PASSO DE TORRES | data-filename="retriever" (isolado) | fim |
| 419523 | MOISÉS E DANIELA PODEM RENUNCIAR AO MANDATO NOS PRÓXIMOS DIAS | data-filename="retriever" (isolado) | meio |
| 419522 | IMPEACHMENT: KENNEDY NUNES SERÁ O RELATOR DO TRIBUNAL MISTO | style="width: 50%..." (isolado) | fim |
| 419520 | JORNAL INFORMATIVO REGIONAL ENTREVISTA OS CANDIDATOS A PREFEITO DA REGIÃO | data-filename="retriever" (isolado) | meio |
| 419507 | IMPEACHMENT: PLENÁRIO DA ALESC ADMITE SEGUNDO PROCESSO CONTRA MOISÉS POR 36 A 2 | style="width: 50%..." (isolado) | meio |
| 419498 | MOISÉS FALA SOBRE AFASTAMENTO E TRANSIÇÃO PARA DANIELA; VEJA ENTREVISTA | style="width: 50%..." (isolado) | fim |
| 419444 | GRUPO PRÓ-DANIELA QUER PRESSÃO SOBRE TRIBUNAL MISTO | data-filename="retriever" (isolado) | meio |
| 418229 | BRASIL PODERÁ REALIZAR ATÉ 50 MIL TESTES DE COVID-19 POR DIA | data-filename="retriever" (isolado) | meio |
| 418214 | COVID-19: BRASIL TEM 1,5 MIL MORTES E 25,2 MIL CASOS CONFIRMADO | data-filename="retriever" (isolado) | fim |
| 418211 | CORONAVÍRUS EM SC: ESTADO DISTRIBUI 20 MIL TESTES RÁPIDOS, 3 MILHÕES DE PARES DE LUVAS E 50 MIL MÁSCARAS | data-filename="retriever" (isolado) | fim |
| 418209 | DEPUTADOS QUESTIONAM GOVERNO SOBRE HOSPITAL DE CAMPANHA EM ITAJAÍ | data-filename="retriever" (isolado) | fim |
| 418205 | USO DE MÁSCARAS SERÁ OBRIGATÓRIO EM ARARANGUÁ | style="width: 50%..." (isolado) | fim |
| 418199 | COVID-19: BRASIL BATE NOVO RECORDE DE MORTES E CASOS EM UM DIA | style="width: 50%..." (isolado) | fim |
| 418195 | BRASIL TEM 36,5 MIL CASOS DE CORONAVÍRUS E 2,3 MIL MORTES REGISTRADAS | data-filename="retriever" (isolado) | fim |
| 418188 | COM ISOLAMENTO, 58% DOS BRASILEIROS DEIXARAM DE PAGAR ALGUMA DÍVIDA | style="width: Npx; height: Npx;..." | meio |
| 418171 | BOLETIM DIÁRIO DO GOVERNO DE SANTA CATARINA AMPLIA INFORMAÇÕES COM DADOS SOBRE OCUPAÇÃO DE LEITOS DE UTI | data-filename="retriever" (isolado) | meio |
| 418163 | CORONAVÍRUS EM SC: GOVERNO DO ESTADO CONFIRMA 1.115 CASOS E 39 ÓBITOS POR COVID-19 | data-filename="retriever" (isolado) | meio |
| 418160 | BRASIL TEM MAIS DE 400 MORTES POR COVID-19 EM 24 HORAS | data-filename="retriever" (isolado) | fim |
| 418152 | GOVERNO DO ESTADO CONFIRMA 1.209 CASOS DE COVID-19 | style="width: 50%..." (isolado) | fim |
| 418124 | SEGUNDA ETAPA DE PESQUISA ESTIMA QUE RS TENHA MAIS DE 15 MIL INFECTADOS POR COVID-19 | style="width: 50%..." (isolado) | meio |
| 418089 | COVID-19: BRASIL BATE NOVO RECORDE DE MORTES REGISTRADAS EM UM DIA | data-filename="retriever" (isolado) | meio |
| 418082 | COVID-19: PAÍS BATE RECORDE DE MORTES E CASOS CONFIRMADOS NOTIFICADOS | data-filename="retriever" (isolado) | fim |
| 418081 | COVID-19: GOVERNO ANUNCIA PLANO DE TESTES | data-filename="retriever" (isolado) | meio |
| 418072 | AMESC: REGIÃO TERMINA A SEXTA-FEIRA (08) COM 75 CASOS CONFIRMADOS DE COVID-19 | data-filename="retriever" (isolado) | meio |
| 418070 | ENTENDA O MODELO DE DISTANCIAMENTO CONTROLADO DO RS | data-filename="retriever" (isolado) | meio |
| 418067 | BRASIL CHEGA A 11,1 MIL MORTES POR COVID-19 | data-filename="retriever" (isolado) | fim |
| 418052 | COVID-19: BRASIL TEM 881 MORTES REGISTRADAS EM 24H E CHEGA A 12,4 MIL | data-filename="retriever" (isolado) | meio |
| 418045 | COVID-19: PAÍS TEM 844 NOVAS MORTES REGISTRADAS; TOTAL CHEGA A 13.993 | data-filename="retriever" (isolado) | meio |
| 418042 | TORRES DECRETA USO DE MÁSCARAS NAS RUAS E FAZ REGRAS PARA EVITAR A BANDEIRA VERMELHA | style="width: 50%..." (isolado) | fim |
| 418041 | COOPERJA E SICOOB CREDIJA DOAM RESPIRADORES E MATERIAIS PARA HOSPITAIS | data-filename="retriever" (isolado) | meio |
| 418023 | COVID-19: EX-GRÊMIO VENDE RELÍQUIAS PARA AJUDAR PESSOAS MAIS CARENTES | data-filename="retriever" (isolado) | meio |
| 418018 | AMESC CONFIRMA 26 CASOS DE COVID-19 NESTA SEGUNDA-FEIRA (18) | data-filename="retriever" (isolado) | meio |
| 418009 | COVID-19: BRASIL PASSA DA MARCA DE MIL MORTES REGISTRADAS POR DIA | data-filename="retriever" (isolado) | meio |
| 417999 | BRASIL TEM 291.579 CASOS CONFIRMADOS DE COVID-19, SENDO 116.683 RECUPERADOS | style="width: Npx; height: Npx;..." | meio |
| 417983 | COVID-19: BRASIL TEM MIL NOVAS MORTES E TOTAL CHEGA A 21.048 | style="width: Npx; height: Npx;..." | meio |
| 417982 | COVID-19: BRASIL TEM MIL NOVAS MORTES E TOTAL CHEGA A 21.048 | style="width: Npx; height: Npx;..." | meio |
| 417976 | CORONAVÍRUS EM SC: MEDIDAS DE DISTANCIAMENTO SOCIAL SALVAM VIDAS NO ESTADO | data-filename="retriever" (isolado) | meio |
| 417971 | AMESC CONFIRMA 206 CASOS DE CORONAVÍRUS | data-filename="retriever" (isolado) | meio |
| 417960 | QUARTA ETAPA DE PESQUISA APONTA ESTABILIDADE NO TOTAL DE INFECTADOS POR CORONAVÍRUS NO RS | data-filename="retriever" (isolado) | meio |
| 417943 | CORONAVÍRUS: BRASIL TEM 526,4 MIL CASOS COM 211 MIL CURADOS | data-filename="retriever" (isolado) | meio |
| 417922 | MINISTÉRIO DA SAÚDE CORRIGE DADOS SOBRE COVID-19 | data-filename="retriever" (isolado) | fim |
| 417916 | SANTA CATARINA REGISTRA AUMENTO NA DOAÇÃO DE ÓRGÃOS EM 2020 | data-filename="retriever" (isolado) | meio |
| 417902 | BRASIL ACUMULA 867,6 MIL CASOS DO NOVO CORONAVÍRUS | data-filename="retriever" (isolado) | fim |
| 417891 | SANTA CATARINA TEM MAIS DE 11,8 MIL RECUPERADOS DA DOENÇA | data-filename="retriever" (isolado) | meio |
| 417845 | CONFIRMADA A 9ª MORTE DE COVID-19 NA REGIÃO DA AMESC | style="width: Npx; height: Npx;..." | meio |
| 417801 | CORONAVÍRUS EM SC: GOVERNO DO ESTADO COMPLETA 120 DIAS DE ENFRENTAMENTO À PANDEMIA E MANTÉM MELHOR DESEMPENHO DO PAÍS | data-filename="retriever" (isolado) | fim |
| 417791 | RS: MAPA PRELIMINAR APONTA 90% DAS REGIÕES COM BANDEIRA VERMELHA NA 11ª RODADA DO DISTANCIAMENTO CONTROLADO | style="width: 50%..." (isolado) | meio |
| 417786 | BRASIL REGISTRA 2.074.860 PESSOAS INFECTADAS PELO NOVO CORONAVÍRUS | data-filename="retriever" (isolado) | fim |
| 417744 | SOBE PARA 12 O NÚMERO DE REGIÕES CLASSIFICADAS COM RISCO GRAVÍSSIMO EM SC | data-filename="retriever" (isolado) | meio |
| 417727 | TORRES E REGIÃO FICAM NA BANDEIRA LARANJA (RISCO MÉDIO) NA 13ª RODADA DO DISTANCIAMENTO CONTROLADO | style="width: 50%..." (isolado) | fim |
| 417719 | SÃO JOÃO DO SUL: SECRETÁRIA DE SAÚDE REJANE BORBA TESTA POSITIVO AO NOVO CORONAVÍRUS | data-filename="retriever" (isolado) | fim |
| 417717 | EM CENÁRIO PESSIMISTA, SAÚDE PROJETA 1,6 MIL MORTES NOS PRÓXIMOS 20 DIAS EM SANTA CATARINA | data-filename="retriever" (isolado) | meio |
| 417709 | SECRETARIA DE SAÚDE DE JACINTO MACHADO AMPLIA TESTAGEM AO COVID-19 | data-filename="retriever" (isolado) | fim |
| 417704 | COVID-19: 100% DOS CASOS CONFIRMADOS ATÉ O MOMENTO EM MORRINHOS DO SUL ESTÃO CURADOS | data-filename="retriever" (isolado) | fim |
| 417699 | PRAIA GRANDE CONFIRMA 1ª MORTE POR COVID-19 | data-filename="retriever" (isolado) | fim |
| 417691 | BRASIL REGISTRA MAIS DE 100 MIL MORTES POR COVID-19 | style="width: 50%..." (isolado) | fim |
| 417674 | COVID-19: SÃO JOÃO DO SUL, PRAIA GRANDE E MAMPITUBA CONFIRMAM NOVOS CASOS | data-filename="retriever" (isolado) | fim |
| 417642 | PROPORÇÃO DE INFECTADOS PELA COVID-19 CRESCE E ATINGE UMA A CADA 82 PESSOAS NO RS, ESTIMA PESQUISA | style="width: 50%..." (isolado) | meio |
| 417638 | BRASIL CHEGA A 3,58 MILHÕES DE CASOS E 114,25 MIL MORTES POR COVID-19 | style="width: 50%..." (isolado) | fim |
| 417624 | COVID-19: BRASIL TEM 117 MIL MORTES E 3,7 MILHÕES DE CASOS ACUMULADOS | style="width: 50%..." (isolado) | fim |
| 417603 | COVID-19: MULHER DE 72 ANOS É O 3º ÓBITO CONFIRMADO EM SÃO JOÃO DO SUL | data-filename="retriever" (isolado) | fim |
| 417590 | COVID-19: BRASIL TEM 125,5 MIL MORTES E 4 MILHÕES DE CASOS ACUMULADOS | style="width: 50%..." (isolado) | fim |
| 417585 | OITO REGIÕES FICAM NA BANDEIRA VERMELHA NA 18ª RODADA DO DISTANCIAMENTO CONTROLADO NO RS | data-filename="retriever" (isolado) | meio |
| 417581 | PESQUISA SOBRE CORONAVÍRUS APONTA DESACELERAÇÃO DA PANDEMIA NO RIO GRANDE DO SUL | data-filename="retriever" (isolado) | meio |
| 417553 | SC NÃO TEM MAIS REGIÕES EM RISCO GRAVÍSSIMO | data-filename="retriever" (isolado) | fim |
| 417540 | SEGUNDA MORTE POR COVID-19 É CONFIRMADA EM PRAIA GRANDE | style="width: 50%..." (isolado) | meio |
| 417538 | COVID-19: BRASIL REGISTRA 365 MORTES E 8.456 NOVOS CASOS EM 24 HORAS | style="width: 50%..." (isolado) | fim |
| 417520 | BRASIL REGISTRA 10,9 MIL NOVOS CASOS DE COVID-19 EM 24 HORAS | style="width: 50%..." (isolado) | fim |
| 417519 | SINTOMAS, CAUSAS, DEPRESSÃO | data-filename="retriever" (isolado) | meio |
| 417511 | TRANSTORNOS DE ANSIEDADE | data-filename="retriever" (isolado) | meio |
| 417509 | COVID-19: REGIÃO DA AMESC ESTÁ EM ALERTA DEVIDO AO AUMENTO DO NÚMERO DE CASOS | data-filename="retriever" (isolado) | fim |
| 417500 | SECRETARIA DE ESTADO DA SAÚDE SEGUE COM ALERTA PARA O EXTREMO SUL CATARINENSE | style="width: 50%..." (isolado) | fim |
| 417490 | NOVA MATRIZ DE RISCO TRAZ GRANDE FLORIANÓPOLIS EM ESTADO GRAVÍSSIMO | data-filename="retriever" (isolado) | fim |
| 417489 | COVID: ALTA DE CASOS E ÓBITOS LIGA ALERTA PARA DEZ REGIÕES DE SC | data-filename="retriever" (isolado) | fim |
| 417432 | GOVERNO ALERTA EM NOVA MATRIZ DE RISCO PARA 13 REGIÕES EM NÍVEL GRAVÍSSIMO E TRÊS REGIÕES EM NÍVEL GRAVE | data-filename="retriever" (isolado) | meio |
| 417410 | SC TEM 15 REGIÕES EM RISCO GRAVÍSSIMO | data-filename="retriever" (isolado) | fim |
| 420119 | CEPRAG DESENVOLVE TRABALHO DE DESTAQUE NA ÁREA SOCIAL | data-filename="retriever" (isolado) | fim |

## 8. Nenhuma escrita real nesta etapa

- Nenhum refetch de rede em nenhum dos 4 lotes.
- Nenhum dado de produção (2019-2020, já importado) foi alterado.
- O cache local de 2021-2022 foi reprocessado (sanitizado) e o preflight foi regenerado a partir dele — ainda **sem nenhuma importação real** de 2021-2022.
