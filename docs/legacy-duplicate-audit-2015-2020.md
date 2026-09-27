# Auditoria de duplicatas — lote 2015-2020 (SOMENTE LEITURA)

Gerado em: 2026-09-27T02:28:23.410Z

Pedido pelo usuário após observar visualmente uma matéria duplicada no portal ("HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"). Esta auditoria cobre os **9213 articles** já migrados dos 3 lotes concluídos (2015-2016, 2017-2018, 2019-2020). **Nada foi apagado, mesclado ou alterado** — só auditado e classificado.

## Resumo executivo

| Métrica | Valor |
|---|---|
| Total de articles auditados | 9213 |
| Grupos com mesmo título normalizado + mesma data | **68** |
| Articles envolvidos nesses grupos | 144 |
| Grupos com corpo idêntico (hash exato) | 72 |
| Articles envolvidos (corpo idêntico) | 151 |
| Grupos com mesma imagem de capa entre articles diferentes | 0 |
| **Duplicata estruturalmente impossível** (mesmo `external_id` em 2 articles) | 0 |
| **Duplicata estruturalmente impossível** (mesma `source_url` em 2 articles) | 0 |

**Nenhuma duplicata por identidade** (`external_id`/`source_url` iguais em dois `articles` diferentes) foi encontrada — o índice único de `article_external_sources` está funcionando corretamente. Toda duplicata encontrada é por **conteúdo republicado no site legado sob um `external_id`/URL diferente** — ou seja, é uma duplicata que já existia no site antigo, não um bug da migração.

## Classificação dos 68 grupos (mesmo título+data)

| Veredito | Grupos | Articles |
|---|---|---|
| Duplicata real provável (mesmo corpo, capas diferentes) | 28 | 60 |
| Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente) | 11 | 23 |
| Duplicata real provável (mesmo corpo, mesma capa/sem capa) | 26 | 55 |
| Legítimo — mesmo título/data, conteúdo claramente diferente | 3 | 6 |

**54 grupos (115 articles) são duplicatas reais prováveis** (corpo idêntico depois de normalizado). Mais **11 grupos** têm corpos de tamanho quase idêntico mas hash diferente (provável edição pequena entre a republicação — ex.: typo corrigido) e precisam de inspeção manual antes de decidir. Só **3 grupos** têm conteúdo claramente diferente apesar do título/data iguais (coincidência legítima, ex.: títulos genéricos reaproveitados como "COVID-19" ou nomes de eventos anuais).

## Caso citado pelo usuário: "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"

**Confirmado: é uma duplicata real.** O site legado publicou a mesma matéria duas vezes, com `external_id` diferente, 5 minutos de diferença, e fotos de capa diferentes (mas corpo do texto idêntico):

| Campo | Ocorrência 1 | Ocorrência 2 |
|---|---|---|
| `article.id` | `115dd77f-3529-4d24-95c0-c476906236ab` | `8e8f3e38-fe2b-41f0-8ddc-450d4cccb200` |
| Slug novo | `homem-reencontra-a-familia-apos-26-anos-desaparecido-420123` | `homem-reencontra-a-familia-apos-26-anos-desaparecido-420122` |
| `external_id` | 420123 | 420122 |
| URL de origem | https://www.informativoregional.net/sociais/homem_reencontra_a_familia_apos_26_anos_desaparecido.420123 | https://www.informativoregional.net/sociais/homem_reencontra_a_familia_apos_26_anos_desaparecido.420122 |
| Publicado em | 2020-09-26 18:29 | 2020-09-26 18:34 |
| Editoria | Sociais | Sociais |
| Tamanho do corpo | 3867 caracteres | 3867 caracteres |
| Hash do corpo | `7db2ee686cb4d528b5ea59a2b0d503d08868ff8a` | `7db2ee686cb4d528b5ea59a2b0d503d08868ff8a` (idêntico) |
| Capa (URL original) | https://suitacdn.cloud-bricks.net/fotos/636384/file/desktop/160114498180914.jpg | https://suitacdn.cloud-bricks.net/fotos/636360/file/desktop/160114534656214.jpg (foto diferente) |

Como os dois `external_id` (420122 e 420123) são diferentes e ambos vieram do site legado real (confirmado via `source_url`), **nenhuma regra de deduplicação por identidade poderia ter evitado isso** — é uma duplicata que já existia na fonte, publicada duas vezes pela própria redação/CMS do site antigo com 5 minutos de diferença. A decisão de mesclar/remover uma das duas cópias é editorial, não técnica, e não foi tomada nesta auditoria.

## Comparação com a auditoria antiga (Fase 34)

A auditoria original (`docs/legacy-audit.json`, antes de qualquer migração) reportou **48** ocorrências de título+data duplicado — mas sobre TODO o inventário do site (23.393 itens, 2015-2026, a maioria ainda não migrada) e contando duplicatas extras (não grupos). Esta auditoria cobre só os **9.213 articles já migrados** (2015-2020) e conta **grupos** (68 grupos = 76 ocorrências além da primeira de cada grupo). Os números não são diretamente comparáveis (escopos de anos e métricas diferentes) — **não foi assumido que um número explica o outro**. O fato relevante é que ambas as auditorias, em momentos e métodos diferentes, confirmam que duplicatas título+data são um padrão real e não-trivial no site legado, não um artefato pontual.

## Todos os 68 grupos, por veredito

### Duplicata real provável (mesmo corpo, capas diferentes) (28 grupos)

### 1. "ANJOS DO FUTSAL DE SÃO JOÃO DO SUL  RECEBEM OS UNIFORMES" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `418902` — anjos-do-futsal-de-sao-joao-do-sul-recebem-os-uniformes-418902 — 2015-06-27 13:44 — esporte — corpo: 1029 car. — capa: sim
  - `418900` — anjos-do-futsal-de-sao-joao-do-sul-recebem-os-uniformes-418900 — 2015-06-27 13:56 — esporte — corpo: 1029 car. — capa: sim

### 2. "PERSONALIDADE DA SEMANA: OZIEL LUIZ BITENCOURT" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `420248` — personalidade-da-semana-oziel-luiz-bitencourt-420248 — 2015-08-17 23:45 — sociais — corpo: 2080 car. — capa: sim
  - `420252` — personalidade-da-semana-oziel-luiz-bitencourt-420252 — 2015-08-17 23:07 — sociais — corpo: 2080 car. — capa: sim

### 3. "ASSOCIAÇÃO DE AGRICULTORES DE PASSO DE TORRES, A SERVIÇO DO ASSOCIADO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `416689` — associacao-de-agricultores-de-passo-de-torres-a-servico-do-associado-416689 — 2015-08-17 17:52 — geral — corpo: 2577 car. — capa: sim
  - `416687` — associacao-de-agricultores-de-passo-de-torres-a-servico-do-associado-416687 — 2015-08-17 17:54 — geral — corpo: 2577 car. — capa: sim

### 4. "FACÇÃO S.A. GERA EMPREGO E RENDA EM SÃO JOÃO DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `416553` — faccao-sa-gera-emprego-e-renda-em-sao-joao-do-sul-416553 — 2015-11-13 17:42 — geral — corpo: 730 car. — capa: sim
  - `416551` — faccao-sa-gera-emprego-e-renda-em-sao-joao-do-sul-416551 — 2015-11-13 18:03 — geral — corpo: 730 car. — capa: sim

### 5. "BOLETIM EPIDEMIOLÓGICO DE TORRES - 24/03/2020" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `410545` — boletim-epidemiologico-de-torres-24-03-2020-410545 — 2020-03-24 11:18 — geral — corpo: 285 car. — capa: sim
  - `410547` — boletim-epidemiologico-de-torres-24-03-2020-410547 — 2020-03-24 11:18 — geral — corpo: 285 car. — capa: sim

### 6. "HOMEM PERDE A VIDA EM PRAIA GRANDE" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415543` — homem-perde-a-vida-em-praia-grande-415543 — 2017-01-23 12:31 — geral — corpo: 968 car. — capa: sim
  - `415540` — homem-perde-a-vida-em-praia-grande-415540 — 2017-01-23 16:30 — geral — corpo: 968 car. — capa: sim

### 7. "CASAL É PRESO POR CRIME AMBIENTAL E TRÁFICO DE DROGAS EM PASSO DE TORRES" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415453` — casal-e-preso-por-crime-ambiental-e-trafico-de-drogas-em-passo-de-torres-415453 — 2017-02-25 02:10 — geral — corpo: 581 car. — capa: sim
  - `415447` — casal-e-preso-por-crime-ambiental-e-trafico-de-drogas-em-passo-de-torres-415447 — 2017-02-25 04:10 — geral — corpo: 581 car. — capa: sim

### 8. "PREFEITO CARLOS SOUZA FALA DA CRISE FINANCEIRA DE TORRES" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415452` — prefeito-carlos-souza-fala-da-crise-financeira-de-torres-415452 — 2017-02-25 02:21 — geral — corpo: 3000 car. — capa: sim
  - `415445` — prefeito-carlos-souza-fala-da-crise-financeira-de-torres-415445 — 2017-02-25 04:21 — geral — corpo: 3000 car. — capa: sim

### 9. "GESTORES DE TURISMO DE MAMPITUBA  PARTICIPAM DE CURSO NA FAMURS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415451` — gestores-de-turismo-de-mampituba-participam-de-curso-na-famurs-415451 — 2017-02-25 02:23 — geral — corpo: 1158 car. — capa: sim
  - `415444` — gestores-de-turismo-de-mampituba-participam-de-curso-na-famurs-415444 — 2017-02-25 04:23 — geral — corpo: 1158 car. — capa: sim

### 10. "VEÍCULO DE  TORRES CAPOTA  EM SANTA ROSA DO SUL" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415187` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415187 — 2017-05-25 19:09 — geral — corpo: 600 car. — capa: sim
  - `415207` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415207 — 2017-05-25 17:09 — geral — corpo: 600 car. — capa: sim
  - `415188` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415188 — 2017-05-25 19:09 — geral — corpo: 600 car. — capa: não

### 11. "TENTATIVA DE FURTO A BANCO EM TORRES" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415252` — tentativa-de-furto-a-banco-em-torres-415252 — 2017-05-11 14:17 — geral — corpo: 1069 car. — capa: sim
  - `415251` — tentativa-de-furto-a-banco-em-torres-415251 — 2017-05-11 14:21 — geral — corpo: 1069 car. — capa: sim

### 12. "SANTA CATARINA TEM MUNICÍPIOS COM ELEVADO RISCO DE TRANSMISSÃO DE DENGUE, FEBRE DE CHIKUNGUNYA E ZIKA VÍRUS" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `415235` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415235 — 2017-05-18 18:04 — geral — corpo: 2295 car. — capa: sim
  - `415234` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415234 — 2017-05-18 18:04 — geral — corpo: 2295 car. — capa: sim
  - `415213` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415213 — 2017-05-18 20:04 — geral — corpo: 2295 car. — capa: não

### 13. "CENTENAS DE PESSOAS PRESTIGIARAM A GRANDE FINAL DO CAMPEONATO MUNICIPAL DE FUTEBOL DE MORRINHOS DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `414603` — centenas-de-pessoas-prestigiaram-a-grande-final-do-campeonato-municipal-de-futeb-414603 — 2017-11-01 16:07 — geral — corpo: 3099 car. — capa: sim
  - `418522` — centenas-de-pessoas-prestigiaram-a-grande-final-do-campeonato-municipal-de-futeb-418522 — 2017-11-01 16:32 — esporte — corpo: 3099 car. — capa: sim

### 14. "DILCEU SEGUE A FRENTE DA SOCIEDADE ESPORTIVA  E RECREATIVA SÃO JOÃO DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `414009` — dilceu-segue-a-frente-da-sociedade-esportiva-e-recreativa-sao-joao-do-sul-414009 — 2018-04-13 13:53 — geral — corpo: 1050 car. — capa: sim
  - `414005` — dilceu-segue-a-frente-da-sociedade-esportiva-e-recreativa-sao-joao-do-sul-414005 — 2018-04-13 18:46 — geral — corpo: 1050 car. — capa: sim

### 15. "DEPUTADO TEBALDI DESTINA MAIS  DE R$ 3 MILHÕES PARA O SUL CATARINENSE" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `413967` — deputado-tebaldi-destina-mais-de-r-3-milhoes-para-o-sul-catarinense-413967 — 2018-04-23 14:21 — geral — corpo: 1367 car. — capa: sim
  - `413966` — deputado-tebaldi-destina-mais-de-r-3-milhoes-para-o-sul-catarinense-413966 — 2018-04-23 14:21 — geral — corpo: 1367 car. — capa: sim

### 16. "VETERANOS DO PASSO MAGNUS EMPATAM EM JOGO DE MUITOS GOLS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `418495` — veteranos-do-passo-magnus-empatam-em-jogo-de-muitos-gols-418495 — 2018-05-25 12:51 — esporte — corpo: 1867 car. — capa: sim
  - `418494` — veteranos-do-passo-magnus-empatam-em-jogo-de-muitos-gols-418494 — 2018-05-25 12:51 — esporte — corpo: 1867 car. — capa: sim

### 17. "DEFINIDOS OS CONFRONTOS DAS QUARTAS  DE FINAIS DA COPA SUL DOS CAMPEÕES 2019" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `418438` — definidos-os-confrontos-das-quartas-de-finais-da-copa-sul-dos-campeoes-2019-418438 — 2019-05-03 12:41 — esporte — corpo: 2477 car. — capa: sim
  - `413117` — definidos-os-confrontos-das-quartas-de-finais-da-copa-sul-dos-campeoes-2019-413117 — 2019-05-03 12:40 — geral — corpo: 2477 car. — capa: sim

### 18. "FISCAIS AGROPECUÁRIOS DO RS MONITORAM NUVEM DE GAFANHOTOS VINDA DA ARGENTINA" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `420319` — fiscais-agropecuarios-do-rs-monitoram-nuvem-de-gafanhotos-vinda-da-argentina-420319 — 2020-06-27 23:01 — agricultura — corpo: 2047 car. — capa: sim
  - `420318` — fiscais-agropecuarios-do-rs-monitoram-nuvem-de-gafanhotos-vinda-da-argentina-420318 — 2020-06-27 23:10 — agricultura — corpo: 2047 car. — capa: sim

### 19. "BM E PC PRENDEM HOMEM SUSPEITO DE HOMICÍDIO EM MORRINHOS DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `419192` — bm-e-pc-prendem-homem-suspeito-de-homicidio-em-morrinhos-do-sul-419192 — 2020-08-30 19:53 — policia — corpo: 568 car. — capa: sim
  - `419193` — bm-e-pc-prendem-homem-suspeito-de-homicidio-em-morrinhos-do-sul-419193 — 2020-08-30 19:53 — policia — corpo: 568 car. — capa: sim

### 20. "FETAG-RS LANÇA  ABAIXO-ASSINADO CONTRA A REFORMA DA PREVIDÊNCIA" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `413292` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413292 — 2019-03-08 12:10 — geral — corpo: 863 car. — capa: sim
  - `413291` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413291 — 2019-03-08 12:13 — geral — corpo: 863 car. — capa: sim
  - `413287` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413287 — 2019-03-08 12:19 — geral — corpo: 863 car. — capa: sim

### 21. "SUCESSO NA FESTA DO PADROEIRO SÃO DOMINGOS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `412780` — sucesso-na-festa-do-padroeiro-sao-domingos-412780 — 2019-08-09 13:55 — geral — corpo: 2239 car. — capa: sim
  - `412779` — sucesso-na-festa-do-padroeiro-sao-domingos-412779 — 2019-08-09 13:56 — geral — corpo: 2239 car. — capa: sim

### 22. "MAIS DE 200 CARROS PARTICIPAM DE CARREATA DE JONAS E ÁUREO EM PASSO DE TORRES" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `419514` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419514 — 2020-10-13 20:31 — politica — corpo: 414 car. — capa: sim
  - `419513` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419513 — 2020-10-13 20:32 — politica — corpo: 414 car. — capa: sim
  - `419512` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419512 — 2020-10-13 20:40 — politica — corpo: 414 car. — capa: sim

### 23. "ALESC PRORROGA DECRETO DE ESTADO DE CALAMIDADE PÚBLICA ATÉ 31 DE MARÇO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `407485` — alesc-prorroga-decreto-de-estado-de-calamidade-publica-ate-31-de-marco-407485 — 2020-12-16 19:02 — geral — corpo: 792 car. — capa: sim
  - `407481` — alesc-prorroga-decreto-de-estado-de-calamidade-publica-ate-31-de-marco-407481 — 2020-12-16 22:18 — geral — corpo: 792 car. — capa: sim

### 24. "MOACIR E EDINHO E VEREADORES FAZEM A FESTA DA VITÓRIA NAS ELEIÇÕES EM SÃO JOÃO DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `419450` — moacir-e-edinho-e-vereadores-fazem-a-festa-da-vitoria-nas-eleicoes-em-sao-joao-d-419450 — 2020-11-16 12:48 — politica — corpo: 519 car. — capa: sim
  - `419449` — moacir-e-edinho-e-vereadores-fazem-a-festa-da-vitoria-nas-eleicoes-em-sao-joao-d-419449 — 2020-11-16 12:49 — politica — corpo: 519 car. — capa: sim

### 25. "RESPIRADORES DA VEIGAMED REPRESENTAM 70% DE TODO O GASTO DO GOVERNO CONTRA O CORONAVÍRUS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `418004` — respiradores-da-veigamed-representam-70-de-todo-o-gasto-do-governo-contra-o-coro-418004 — 2020-05-20 15:39 — saude — corpo: 2479 car. — capa: sim
  - `418001` — respiradores-da-veigamed-representam-70-de-todo-o-gasto-do-governo-contra-o-coro-418001 — 2020-05-20 18:51 — saude — corpo: 2479 car. — capa: sim

### 26. "COVID-19: MEDIDAS DE DISTANCIAMENTO SOCIAL SALVAM VIDAS NO ESTADO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `417997` — covid-19-medidas-de-distanciamento-social-salvam-vidas-no-estado-417997 — 2020-05-21 20:41 — saude — corpo: 2798 car. — capa: sim
  - `417996` — covid-19-medidas-de-distanciamento-social-salvam-vidas-no-estado-417996 — 2020-05-21 20:41 — saude — corpo: 2798 car. — capa: sim

### 27. "SANTA CATARINA REGISTRA 5.610 CASOS E 98 ÓBITOS POR COVID-19" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `417995` — santa-catarina-registra-5610-casos-e-98-obitos-por-covid-19-417995 — 2020-05-21 21:09 — saude — corpo: 1750 car. — capa: sim
  - `417994` — santa-catarina-registra-5610-casos-e-98-obitos-por-covid-19-417994 — 2020-05-21 21:09 — saude — corpo: 1750 car. — capa: sim

### 28. "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, capas diferentes)
  - `420123` — homem-reencontra-a-familia-apos-26-anos-desaparecido-420123 — 2020-09-26 18:29 — sociais — corpo: 3867 car. — capa: sim
  - `420122` — homem-reencontra-a-familia-apos-26-anos-desaparecido-420122 — 2020-09-26 18:34 — sociais — corpo: 3867 car. — capa: sim

---

### Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente) (11 grupos)

### 1. "CURSO BÁSICO DE COSTURA" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `416552` — curso-basico-de-costura-416552 — 2015-11-13 17:44 — geral — corpo: 1331 car. — capa: sim
  - `416550` — curso-basico-de-costura-416550 — 2015-11-13 18:04 — geral — corpo: 1336 car. — capa: sim

### 2. "ELEIÇÃO DO SINDICATO SERÁ REALIZADA NESTA SEXTA-FEIRA, DIA  20 DE NOVEMBRO" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `416529` — eleicao-do-sindicato-sera-realizada-nesta-sexta-feira-dia-20-de-novembro-416529 — 2015-11-20 19:48 — geral — corpo: 1217 car. — capa: não
  - `419951` — eleicao-do-sindicato-sera-realizada-nesta-sexta-feira-dia-20-de-novembro-419951 — 2015-11-20 19:47 — politica — corpo: 1182 car. — capa: não

### 3. "ESTADO DO RIO GRANDE SUL PREFEITURA MUNICIPAL DE MAMPITUBA" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `415313` — estado-do-rio-grande-sul-prefeitura-municipal-de-mampituba-415313 — 2017-04-20 17:49 — geral — corpo: 565 car. — capa: não
  - `415312` — estado-do-rio-grande-sul-prefeitura-municipal-de-mampituba-415312 — 2017-04-20 17:51 — geral — corpo: 568 car. — capa: não

### 4. "PREFEITO E SECRETÁRIO VISITAM OBRAS  NAS ESCOLAS DA REDE MUNICIPAL DE ENSINO DE PASSO DE TORRES" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `413143` — prefeito-e-secretario-visitam-obras-nas-escolas-da-rede-municipal-de-ensino-de-p-413143 — 2019-04-27 15:07 — geral — corpo: 5078 car. — capa: não
  - `413142` — prefeito-e-secretario-visitam-obras-nas-escolas-da-rede-municipal-de-ensino-de-p-413142 — 2019-04-27 15:26 — geral — corpo: 5058 car. — capa: sim

### 5. "ATENDIMENTO EMERGENCIAL DO TRE-SC INCLUI FILIAÇÃO E DESFILIAÇÃO PARTIDÁRIA" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `410416` — atendimento-emergencial-do-tre-sc-inclui-filiacao-e-desfiliacao-partidaria-410416 — 2020-03-31 16:41 — geral — corpo: 1919 car. — capa: sim
  - `410414` — atendimento-emergencial-do-tre-sc-inclui-filiacao-e-desfiliacao-partidaria-410414 — 2020-03-31 16:43 — geral — corpo: 1924 car. — capa: sim

### 6. "MUDANÇA NA DATA DE ELEIÇÕES MUNICIPAIS PODERÁ SER DECIDIDA EM JUNHO" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `410024` — mudanca-na-data-de-eleicoes-municipais-podera-ser-decidida-em-junho-410024 — 2020-05-04 17:17 — geral — corpo: 3396 car. — capa: sim
  - `419642` — mudanca-na-data-de-eleicoes-municipais-podera-ser-decidida-em-junho-419642 — 2020-05-04 16:41 — politica — corpo: 3367 car. — capa: sim

### 7. "FCDL/SC LANÇA CAMPANHA PARA ENFATIZAR MEDIDAS PREVENTIVAS" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `409765` — fcdl-sc-lanca-campanha-para-enfatizar-medidas-preventivas-409765 — 2020-05-19 16:58 — geral — corpo: 1180 car. — capa: sim
  - `409756` — fcdl-sc-lanca-campanha-para-enfatizar-medidas-preventivas-409756 — 2020-05-19 18:30 — geral — corpo: 1175 car. — capa: sim

### 8. "PROFESSORA DE SOMBRIO MORRE VÍTIMA DE COVID-19" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `418231` — professora-de-sombrio-morre-vitima-de-covid-19-418231 — 2020-04-11 12:24 — saude — corpo: 634 car. — capa: sim
  - `418232` — professora-de-sombrio-morre-vitima-de-covid-19-418232 — 2020-04-11 12:23 — saude — corpo: 629 car. — capa: sim

### 9. "COVID-19: BRASIL TEM MIL NOVAS MORTES E TOTAL CHEGA A 21.048" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `417983` — covid-19-brasil-tem-mil-novas-mortes-e-total-chega-a-21048-417983 — 2020-05-22 22:01 — saude — corpo: 2438 car. — capa: não
  - `417982` — covid-19-brasil-tem-mil-novas-mortes-e-total-chega-a-21048-417982 — 2020-05-22 22:01 — saude — corpo: 2440 car. — capa: sim

### 10. "ALESC APROVA R$ 20 MILHÕES PARA HOSPITAIS FILANTRÓPICOS E CLÍNICAS DE HEMODIÁLISE" (2 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `417742` — alesc-aprova-r-20-milhoes-para-hospitais-filantropicos-e-clinicas-de-hemodialise-417742 — 2020-07-29 20:49 — saude — corpo: 2671 car. — capa: sim
  - `417739` — alesc-aprova-r-20-milhoes-para-hospitais-filantropicos-e-clinicas-de-hemodialise-417739 — 2020-07-29 23:57 — saude — corpo: 2666 car. — capa: sim

### 11. "CHEGA A 100 OS CASOS CONFIRMADOS DE COVID-19 EM MORRINHOS DO SUL" (3 ocorrências)

- **Veredito:** Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)
  - `417406` — chega-a-100-os-casos-confirmados-de-covid-19-em-morrinhos-do-sul-417406 — 2020-12-04 21:29 — saude — corpo: 542 car. — capa: sim
  - `417405` — chega-a-100-os-casos-confirmados-de-covid-19-em-morrinhos-do-sul-417405 — 2020-12-04 21:29 — saude — corpo: 542 car. — capa: sim
  - `417404` — chega-a-100-os-casos-confirmados-de-covid-19-em-morrinhos-do-sul-417404 — 2020-12-04 21:31 — saude — corpo: 557 car. — capa: sim

---

### Duplicata real provável (mesmo corpo, mesma capa/sem capa) (26 grupos)

### 1. "EVENTO DE FORMAÇÃO DOCENTE E FÓRUM  ACADÊMICO SÃO REALIZADOS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `413758` — evento-de-formacao-docente-e-forum-academico-sao-realizados-413758 — 2018-06-18 17:49 — geral — corpo: 2577 car. — capa: sim
  - `413759` — evento-de-formacao-docente-e-forum-academico-sao-realizados-413759 — 2018-06-18 17:49 — geral — corpo: 2577 car. — capa: não

### 2. "DIRETOR DO SAMAE ÁGUA DOS CANYONS FALA DOS AVANÇOS NO SETOR" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415194` — diretor-do-samae-agua-dos-canyons-fala-dos-avancos-no-setor-415194 — 2017-05-25 18:34 — geral — corpo: 2121 car. — capa: não
  - `415193` — diretor-do-samae-agua-dos-canyons-fala-dos-avancos-no-setor-415193 — 2017-05-25 18:35 — geral — corpo: 2121 car. — capa: sim

### 3. "PESCADORES SÃO ALVO DE TRÊS MARGINAIS ENCAPUZADOS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415547` — pescadores-sao-alvo-de-tres-marginais-encapuzados-415547 — 2017-01-19 12:25 — geral — corpo: 1102 car. — capa: não
  - `415546` — pescadores-sao-alvo-de-tres-marginais-encapuzados-415546 — 2017-01-19 12:25 — geral — corpo: 1102 car. — capa: sim

### 4. "FORAGIDO É PRESO EM PRAIA GRANDE" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415186` — foragido-e-preso-em-praia-grande-415186 — 2017-05-25 19:22 — geral — corpo: 2663 car. — capa: não
  - `415185` — foragido-e-preso-em-praia-grande-415185 — 2017-05-25 19:22 — geral — corpo: 2663 car. — capa: não
  - `415206` — foragido-e-preso-em-praia-grande-415206 — 2017-05-25 17:22 — geral — corpo: 2663 car. — capa: sim

### 5. "CICLISTA MORRE AO SER ATROPELADO EM  TRÊS CACHOEIRAS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415178` — ciclista-morre-ao-ser-atropelado-em-tres-cachoeiras-415178 — 2017-05-25 19:54 — geral — corpo: 670 car. — capa: não
  - `415180` — ciclista-morre-ao-ser-atropelado-em-tres-cachoeiras-415180 — 2017-05-25 19:54 — geral — corpo: 670 car. — capa: sim

### 6. "ADMINISTRAÇÃO MUNICIPAL  DE PRAIA GRANDE ADQUIRE VEÍCULO 0KM" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415237` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415237 — 2017-05-18 17:48 — geral — corpo: 405 car. — capa: sim
  - `415217` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415217 — 2017-05-18 19:47 — geral — corpo: 405 car. — capa: não
  - `415216` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415216 — 2017-05-18 19:48 — geral — corpo: 405 car. — capa: não

### 7. "SECRETÁRIO ADILSON MOACIR  FALA DO AUMENTO DE ALUNOS NA REDE MUNICIPAL DE ENSINO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415220` — secretario-adilson-moacir-fala-do-aumento-de-alunos-na-rede-municipal-de-ensino-415220 — 2017-05-18 19:43 — geral — corpo: 1037 car. — capa: sim
  - `415219` — secretario-adilson-moacir-fala-do-aumento-de-alunos-na-rede-municipal-de-ensino-415219 — 2017-05-18 19:43 — geral — corpo: 1037 car. — capa: não

### 8. "TRAFICANTES SÃO PRESOS EM PASSO DE TORRES" (3 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415208` — traficantes-sao-presos-em-passo-de-torres-415208 — 2017-05-25 17:06 — geral — corpo: 1675 car. — capa: sim
  - `415192` — traficantes-sao-presos-em-passo-de-torres-415192 — 2017-05-25 19:06 — geral — corpo: 1675 car. — capa: não
  - `415191` — traficantes-sao-presos-em-passo-de-torres-415191 — 2017-05-25 19:06 — geral — corpo: 1675 car. — capa: não

### 9. "PREFEITO MOACIR FALA DA VIAGEM A BRASÍLIA" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415204` — prefeito-moacir-fala-da-viagem-a-brasilia-415204 — 2017-05-25 17:34 — geral — corpo: 1243 car. — capa: não
  - `415203` — prefeito-moacir-fala-da-viagem-a-brasilia-415203 — 2017-05-25 17:42 — geral — corpo: 1243 car. — capa: sim

### 10. "CAMPANHA DE VACINAÇÃO CONTRA A GRIPE ENCERRA NESTA SEXTA-FEIRA" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415200` — campanha-de-vacinacao-contra-a-gripe-encerra-nesta-sexta-feira-415200 — 2017-05-25 17:56 — geral — corpo: 1383 car. — capa: não
  - `415177` — campanha-de-vacinacao-contra-a-gripe-encerra-nesta-sexta-feira-415177 — 2017-05-25 20:02 — geral — corpo: 1383 car. — capa: não

### 11. "CASO DE  ESTUPRO  CHOCA A REGIÃO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415190` — caso-de-estupro-choca-a-regiao-415190 — 2017-05-25 19:08 — geral — corpo: 959 car. — capa: sim
  - `415189` — caso-de-estupro-choca-a-regiao-415189 — 2017-05-25 19:08 — geral — corpo: 959 car. — capa: não

### 12. "CRISTIA ESTÁ ENTRE AS 20 MULHERES MAIS BELAS DO  RIO GRANDE DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `415128` — cristia-esta-entre-as-20-mulheres-mais-belas-do-rio-grande-do-sul-415128 — 2017-06-14 18:58 — geral — corpo: 490 car. — capa: não
  - `415127` — cristia-esta-entre-as-20-mulheres-mais-belas-do-rio-grande-do-sul-415127 — 2017-06-14 18:58 — geral — corpo: 490 car. — capa: sim

### 13. "NINGUÉM ACERTA AS CINCO DEZENAS DA QUINA DE SÃO JOÃO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `412942` — ninguem-acerta-as-cinco-dezenas-da-quina-de-sao-joao-412942 — 2019-06-25 12:43 — geral — corpo: 644 car. — capa: não
  - `412941` — ninguem-acerta-as-cinco-dezenas-da-quina-de-sao-joao-412941 — 2019-06-25 12:43 — geral — corpo: 644 car. — capa: sim

### 14. "PREFEITO DE TORRES  ENTREGA AMBULÂNCIAS  ADESIVADAS PARA A SAÚDE" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `412813` — prefeito-de-torres-entrega-ambulancias-adesivadas-para-a-saude-412813 — 2019-08-02 12:51 — geral — corpo: 1306 car. — capa: não
  - `412812` — prefeito-de-torres-entrega-ambulancias-adesivadas-para-a-saude-412812 — 2019-08-02 12:51 — geral — corpo: 1306 car. — capa: sim

### 15. "'BELEZAS NATURAIS DE TORRES' É O TEMA DA SEMANA DA PÁTRIA 2019" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `412729` — belezas-naturais-de-torres-e-o-tema-da-semana-da-patria-2019-412729 — 2019-08-21 16:39 — geral — corpo: 1457 car. — capa: não
  - `412728` — belezas-naturais-de-torres-e-o-tema-da-semana-da-patria-2019-412728 — 2019-08-21 16:39 — geral — corpo: 1457 car. — capa: sim

### 16. "GÁS VEICULAR PASSARÁ A SER COMERCIALIZADO EM QUILOGRAMA, EM 2020" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `411646` — gas-veicular-passara-a-ser-comercializado-em-quilograma-em-2020-411646 — 2019-12-18 22:11 — geral — corpo: 4242 car. — capa: não
  - `411644` — gas-veicular-passara-a-ser-comercializado-em-quilograma-em-2020-411644 — 2019-12-18 22:11 — geral — corpo: 4242 car. — capa: sim

### 17. "HOSPITAL REGIONAL DE ARARANGUÁ RECEBERÁ SERVIÇOS DE REFERÊNCIA EM OFTALMOLOGIA, UROLOGIA E ORTOPEDIA" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `411086` — hospital-regional-de-ararangua-recebera-servicos-de-referencia-em-oftalmologia-u-411086 — 2020-02-17 18:26 — geral — corpo: 1616 car. — capa: não
  - `411084` — hospital-regional-de-ararangua-recebera-servicos-de-referencia-em-oftalmologia-u-411084 — 2020-02-17 18:26 — geral — corpo: 1616 car. — capa: sim

### 18. "SETOR DE TRANSPORTE DE CARGAS ACUMULA QUEDAS DE 45,2% A NÍVEL NACIONAL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `410162` — setor-de-transporte-de-cargas-acumula-quedas-de-45-2-a-nivel-nacional-410162 — 2020-04-22 20:06 — geral — corpo: 1210 car. — capa: não
  - `410160` — setor-de-transporte-de-cargas-acumula-quedas-de-45-2-a-nivel-nacional-410160 — 2020-04-22 20:06 — geral — corpo: 1210 car. — capa: sim

### 19. "EDUCAÇÃO CRIA PLANO DE AÇÕES PEDAGÓGICAS PARA O PERÍODO DE SUSPENSÃO DAS AULAS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `410126` — educacao-cria-plano-de-acoes-pedagogicas-para-o-periodo-de-suspensao-das-aulas-410126 — 2020-04-24 17:09 — geral — corpo: 4935 car. — capa: não
  - `410124` — educacao-cria-plano-de-acoes-pedagogicas-para-o-periodo-de-suspensao-das-aulas-410124 — 2020-04-24 17:09 — geral — corpo: 4935 car. — capa: sim

### 20. "GOVERNO DE SC DIVULGA NOTA DE ESCLARECIMENTO SOBRE DENÚNCIAS DO THE INTERCEPT" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `410071` — governo-de-sc-divulga-nota-de-esclarecimento-sobre-denuncias-do-the-intercept-410071 — 2020-04-28 23:06 — geral — corpo: 2479 car. — capa: não
  - `419651` — governo-de-sc-divulga-nota-de-esclarecimento-sobre-denuncias-do-the-intercept-419651 — 2020-04-28 23:06 — politica — corpo: 2479 car. — capa: sim

### 21. "MAIS DE MIL MUNICÍPIOS TERÃO R$ 598 MILHÕES EM EMENDAS PARLAMENTARES" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `409761` — mais-de-mil-municipios-terao-r-598-milhoes-em-emendas-parlamentares-409761 — 2020-05-19 17:43 — geral — corpo: 2686 car. — capa: não
  - `409758` — mais-de-mil-municipios-terao-r-598-milhoes-em-emendas-parlamentares-409758 — 2020-05-19 17:43 — geral — corpo: 2686 car. — capa: sim

### 22. "SANTA CATARINA BATE RECORDE NA EXPORTAÇÃO DE SOJA NOS QUATRO PRIMEIROS MESES DO ANO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `409744` — santa-catarina-bate-recorde-na-exportacao-de-soja-nos-quatro-primeiros-meses-do--409744 — 2020-05-20 12:32 — geral — corpo: 2334 car. — capa: sim
  - `409742` — santa-catarina-bate-recorde-na-exportacao-de-soja-nos-quatro-primeiros-meses-do--409742 — 2020-05-20 12:32 — geral — corpo: 2334 car. — capa: não

### 23. "MPSC DENUNCIA HOMEM POR DIVULGAÇÃO DE FAKE NEWS SOBRE COVID-19 EM SÃO LUDGERO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `419346` — mpsc-denuncia-homem-por-divulgacao-de-fake-news-sobre-covid-19-em-sao-ludgero-419346 — 2020-05-21 12:08 — policia — corpo: 1985 car. — capa: não
  - `419345` — mpsc-denuncia-homem-por-divulgacao-de-fake-news-sobre-covid-19-em-sao-ludgero-419345 — 2020-05-21 12:08 — policia — corpo: 1985 car. — capa: sim

### 24. "SICOOB CREDISULCA TRANSFORMA UNIFORMES ANTIGOS EM MÁSCARAS E AUXILIA COLABORADORES NO COMBATE AO CORONAVÍRUS" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `418156` — sicoob-credisulca-transforma-uniformes-antigos-em-mascaras-e-auxilia-colaborador-418156 — 2020-04-24 12:20 — saude — corpo: 1558 car. — capa: sim
  - `418155` — sicoob-credisulca-transforma-uniformes-antigos-em-mascaras-e-auxilia-colaborador-418155 — 2020-04-24 12:20 — saude — corpo: 1558 car. — capa: não

### 25. "CINCO LEITOS DE UTI DO HOSPITAL DE TORRES SÃO HABILITADOS PELO GOVERNO DO RIO GRANDE DO SUL" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `418098` — cinco-leitos-de-uti-do-hospital-de-torres-sao-habilitados-pelo-governo-do-rio-gr-418098 — 2020-05-04 18:58 — saude — corpo: 4190 car. — capa: não
  - `418097` — cinco-leitos-de-uti-do-hospital-de-torres-sao-habilitados-pelo-governo-do-rio-gr-418097 — 2020-05-04 18:58 — saude — corpo: 4190 car. — capa: sim

### 26. "TORRES TEM BANDEIRA AMARELA NO DISTANCIAMENTO CONTROLADO DO GOVERNO DO ESTADO" (2 ocorrências)

- **Veredito:** Duplicata real provável (mesmo corpo, mesma capa/sem capa)
  - `417975` — torres-tem-bandeira-amarela-no-distanciamento-controlado-do-governo-do-estado-417975 — 2020-05-25 18:57 — saude — corpo: 1538 car. — capa: não
  - `417974` — torres-tem-bandeira-amarela-no-distanciamento-controlado-do-governo-do-estado-417974 — 2020-05-25 18:57 — saude — corpo: 1538 car. — capa: sim

---

### Legítimo — mesmo título/data, conteúdo claramente diferente (3 grupos)

### 1. "XII FESTA DO COLONO ENTRA PARA A HISTÓRIA COMO A MAIOR DE SÃO JOÃO DO SUL" (2 ocorrências)

- **Veredito:** Legítimo — mesmo título/data, conteúdo claramente diferente
  - `413020` — xii-festa-do-colono-entra-para-a-historia-como-a-maior-de-sao-joao-do-sul-413020 — 2019-06-07 12:10 — geral — corpo: 1636 car. — capa: sim
  - `413019` — xii-festa-do-colono-entra-para-a-historia-como-a-maior-de-sao-joao-do-sul-413019 — 2019-06-07 12:36 — geral — corpo: 11743 car. — capa: sim

### 2. "POLÍCIA FAZ GRANDE APREENSÃO DE DROGAS E ARMAS NA REGIÃO" (2 ocorrências)

- **Veredito:** Legítimo — mesmo título/data, conteúdo claramente diferente
  - `412796` — policia-faz-grande-apreensao-de-drogas-e-armas-na-regiao-412796 — 2019-08-09 12:47 — geral — corpo: 3047 car. — capa: sim
  - `412795` — policia-faz-grande-apreensao-de-drogas-e-armas-na-regiao-412795 — 2019-08-09 12:47 — geral — corpo: 1555 car. — capa: sim

### 3. "TORRES E REGIÃO FICAM NA BANDEIRA LARANJA (RISCO MÉDIO) NA 13ª RODADA DO DISTANCIAMENTO CONTROLADO" (2 ocorrências)

- **Veredito:** Legítimo — mesmo título/data, conteúdo claramente diferente
  - `417727` — torres-e-regiao-ficam-na-bandeira-laranja-risco-medio-na-13-rodada-do-distanciam-417727 — 2020-08-01 16:41 — saude — corpo: 1977 car. — capa: sim
  - `417726` — torres-e-regiao-ficam-na-bandeira-laranja-risco-medio-na-13-rodada-do-distanciam-417726 — 2020-08-01 16:42 — saude — corpo: 1809 car. — capa: sim


## O que esta auditoria NÃO fez

- Não apagou, mesclou ou alterou nenhum registro.
- Não decidiu qual das duas (ou mais) cópias de uma duplicata deveria ser mantida.
- Não aplicou nenhuma correção automática — mesmo os 54 grupos classificados como "duplicata real provável" continuam como estão no banco.

## Próximo passo recomendado

Decisão editorial/produto sobre como tratar duplicatas reais do site legado (mesclar preservando as duas URLs antigas em `raw_metadata`? Marcar uma como duplicata e ocultar da navegação sem apagar? Manter as duas, já que ambas existiam de fato no site antigo?) — fora do escopo desta auditoria somente-leitura.

Dados brutos completos: `scripts/legacy-audit/output/duplicate-audit-2015-2020.json` (não versionado — derivado).
