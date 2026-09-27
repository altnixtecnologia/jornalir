# Limpeza de duplicatas confirmadas — lote 2015-2020

Gerado em: 2026-09-27T02:40:54.328Z

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `a66e974`: "URGENTE — limpar duplicatas confirmadas antes de 2021–2022"). Aplica-se **somente** aos 54 grupos classificados como "Duplicata real provável" pela auditoria (`docs/legacy-duplicate-audit-2015-2020.md`) — os 11 grupos "precisa inspeção manual" e os 3 "legítimos" **não foram tocados**.

## O que foi feito

- **Nenhum registro foi apagado ou mesclado.** Para cada um dos 54 grupos confirmados, 1 artigo foi escolhido como canônico (permanece `status = published`) e os demais (61 no total) foram marcados `status = archived`, `archived_at = now()`.
- `article_external_sources`, `media_assets` e `article_media` de TODOS os artigos (canônicos e arquivados) permanecem intactos — nenhuma linha alterada ou removida dessas tabelas.
- Título, corpo, data e editoria do artigo canônico **não foram alterados**.

## Regra de escolha do canônico (determinística, aplicada nesta ordem)

1. Tem capa vence quem não tem.
2. Editoria específica (ex.: Esporte, Política) vence "Geral".
3. Publicação mais recente (`published_at`) vence a mais antiga.
4. Empate exato de `published_at`: maior `external_id` numérico vence.

Distribuição de qual regra decidiu cada um dos 61 arquivamentos (script `duplicate-cleanup.mjs`, contagem feita antes da gravação):

- Decidido pela regra 1 (capa): 30
- Decidido pela regra 2 (editoria específica): 2
- Decidido pela regra 3/4 (mais recente / maior external_id): 29

## Caso do usuário: "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"

**Resolvido.** A ocorrência mais recente foi mantida publicada; a mais antiga foi arquivada:

| | `external_id` | Publicado em | Status final |
|---|---|---|---|
| Mantido (published) | 420122 | 2020-09-26 18:34 | `published` |
| Arquivado | 420123 | 2020-09-26 18:29 | `archived` |

A matéria agora aparece **apenas uma vez** no portal público (a view `public_articles` só mostra `status = published`).

## Validação direta no Supabase (depois da gravação)

| Checagem | Esperado | Encontrado | OK |
|---|---|---|---|
| Total físico de `articles` (`origin=legacy_site`) | 9.213 (inalterado) | 9.213 | ✅ |
| `articles` com `status=published` | 9.213 − 61 = 9.152 | 9.152 | ✅ |
| `articles` com `status=archived` (deste lote) | 61 | 61 | ✅ |
| Os 54 canônicos continuam `published` | 54/54 | 54/54 | ✅ |
| Os 61 planejados estão `archived` com `archived_at` preenchido | 61/61 | 61/61 | ✅ |
| 11 grupos "precisa inspeção manual" (23 articles) continuam `published` | 23/23 | 23/23 | ✅ |
| 3 grupos "legítimos" (6 articles) continuam `published` | 6/6 | 6/6 | ✅ |
| `article_external_sources` total (nenhuma alteração) | 9.213 | 9.213 | ✅ |
| `media_assets` total (nenhuma alteração) | 14.200 | 14.200 | ✅ |
| Caso do usuário aparece só 1x publicamente | sim | sim | ✅ |
| Deletes executados | 0 | 0 | ✅ |

## Todos os 54 grupos corrigidos

### 1. "ANJOS DO FUTSAL DE SÃO JOÃO DO SUL  RECEBEM OS UNIFORMES"

  - **Mantido (published):** `418900` — anjos-do-futsal-de-sao-joao-do-sul-recebem-os-uniformes-418900 — 2015-06-27 13:56 — esporte — capa: sim
  - **Arquivado:** `418902` — anjos-do-futsal-de-sao-joao-do-sul-recebem-os-uniformes-418902 — 2015-06-27 13:44 — esporte — capa: sim

### 2. "PERSONALIDADE DA SEMANA: OZIEL LUIZ BITENCOURT"

  - **Mantido (published):** `420248` — personalidade-da-semana-oziel-luiz-bitencourt-420248 — 2015-08-17 23:45 — sociais — capa: sim
  - **Arquivado:** `420252` — personalidade-da-semana-oziel-luiz-bitencourt-420252 — 2015-08-17 23:07 — sociais — capa: sim

### 3. "ASSOCIAÇÃO DE AGRICULTORES DE PASSO DE TORRES, A SERVIÇO DO ASSOCIADO"

  - **Mantido (published):** `416687` — associacao-de-agricultores-de-passo-de-torres-a-servico-do-associado-416687 — 2015-08-17 17:54 — geral — capa: sim
  - **Arquivado:** `416689` — associacao-de-agricultores-de-passo-de-torres-a-servico-do-associado-416689 — 2015-08-17 17:52 — geral — capa: sim

### 4. "FACÇÃO S.A. GERA EMPREGO E RENDA EM SÃO JOÃO DO SUL"

  - **Mantido (published):** `416551` — faccao-sa-gera-emprego-e-renda-em-sao-joao-do-sul-416551 — 2015-11-13 18:03 — geral — capa: sim
  - **Arquivado:** `416553` — faccao-sa-gera-emprego-e-renda-em-sao-joao-do-sul-416553 — 2015-11-13 17:42 — geral — capa: sim

### 5. "EVENTO DE FORMAÇÃO DOCENTE E FÓRUM  ACADÊMICO SÃO REALIZADOS"

  - **Mantido (published):** `413758` — evento-de-formacao-docente-e-forum-academico-sao-realizados-413758 — 2018-06-18 17:49 — geral — capa: sim
  - **Arquivado:** `413759` — evento-de-formacao-docente-e-forum-academico-sao-realizados-413759 — 2018-06-18 17:49 — geral — capa: não

### 6. "DIRETOR DO SAMAE ÁGUA DOS CANYONS FALA DOS AVANÇOS NO SETOR"

  - **Mantido (published):** `415193` — diretor-do-samae-agua-dos-canyons-fala-dos-avancos-no-setor-415193 — 2017-05-25 18:35 — geral — capa: sim
  - **Arquivado:** `415194` — diretor-do-samae-agua-dos-canyons-fala-dos-avancos-no-setor-415194 — 2017-05-25 18:34 — geral — capa: não

### 7. "BOLETIM EPIDEMIOLÓGICO DE TORRES - 24/03/2020"

  - **Mantido (published):** `410547` — boletim-epidemiologico-de-torres-24-03-2020-410547 — 2020-03-24 11:18 — geral — capa: sim
  - **Arquivado:** `410545` — boletim-epidemiologico-de-torres-24-03-2020-410545 — 2020-03-24 11:18 — geral — capa: sim

### 8. "PESCADORES SÃO ALVO DE TRÊS MARGINAIS ENCAPUZADOS"

  - **Mantido (published):** `415546` — pescadores-sao-alvo-de-tres-marginais-encapuzados-415546 — 2017-01-19 12:25 — geral — capa: sim
  - **Arquivado:** `415547` — pescadores-sao-alvo-de-tres-marginais-encapuzados-415547 — 2017-01-19 12:25 — geral — capa: não

### 9. "HOMEM PERDE A VIDA EM PRAIA GRANDE"

  - **Mantido (published):** `415540` — homem-perde-a-vida-em-praia-grande-415540 — 2017-01-23 16:30 — geral — capa: sim
  - **Arquivado:** `415543` — homem-perde-a-vida-em-praia-grande-415543 — 2017-01-23 12:31 — geral — capa: sim

### 10. "CASAL É PRESO POR CRIME AMBIENTAL E TRÁFICO DE DROGAS EM PASSO DE TORRES"

  - **Mantido (published):** `415447` — casal-e-preso-por-crime-ambiental-e-trafico-de-drogas-em-passo-de-torres-415447 — 2017-02-25 04:10 — geral — capa: sim
  - **Arquivado:** `415453` — casal-e-preso-por-crime-ambiental-e-trafico-de-drogas-em-passo-de-torres-415453 — 2017-02-25 02:10 — geral — capa: sim

### 11. "PREFEITO CARLOS SOUZA FALA DA CRISE FINANCEIRA DE TORRES"

  - **Mantido (published):** `415445` — prefeito-carlos-souza-fala-da-crise-financeira-de-torres-415445 — 2017-02-25 04:21 — geral — capa: sim
  - **Arquivado:** `415452` — prefeito-carlos-souza-fala-da-crise-financeira-de-torres-415452 — 2017-02-25 02:21 — geral — capa: sim

### 12. "GESTORES DE TURISMO DE MAMPITUBA  PARTICIPAM DE CURSO NA FAMURS"

  - **Mantido (published):** `415444` — gestores-de-turismo-de-mampituba-participam-de-curso-na-famurs-415444 — 2017-02-25 04:23 — geral — capa: sim
  - **Arquivado:** `415451` — gestores-de-turismo-de-mampituba-participam-de-curso-na-famurs-415451 — 2017-02-25 02:23 — geral — capa: sim

### 13. "VEÍCULO DE  TORRES CAPOTA  EM SANTA ROSA DO SUL"

  - **Mantido (published):** `415187` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415187 — 2017-05-25 19:09 — geral — capa: sim
  - **Arquivado:** `415207` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415207 — 2017-05-25 17:09 — geral — capa: sim
  - **Arquivado:** `415188` — veiculo-de-torres-capota-em-santa-rosa-do-sul-415188 — 2017-05-25 19:09 — geral — capa: não

### 14. "FORAGIDO É PRESO EM PRAIA GRANDE"

  - **Mantido (published):** `415206` — foragido-e-preso-em-praia-grande-415206 — 2017-05-25 17:22 — geral — capa: sim
  - **Arquivado:** `415186` — foragido-e-preso-em-praia-grande-415186 — 2017-05-25 19:22 — geral — capa: não
  - **Arquivado:** `415185` — foragido-e-preso-em-praia-grande-415185 — 2017-05-25 19:22 — geral — capa: não

### 15. "CICLISTA MORRE AO SER ATROPELADO EM  TRÊS CACHOEIRAS"

  - **Mantido (published):** `415180` — ciclista-morre-ao-ser-atropelado-em-tres-cachoeiras-415180 — 2017-05-25 19:54 — geral — capa: sim
  - **Arquivado:** `415178` — ciclista-morre-ao-ser-atropelado-em-tres-cachoeiras-415178 — 2017-05-25 19:54 — geral — capa: não

### 16. "TENTATIVA DE FURTO A BANCO EM TORRES"

  - **Mantido (published):** `415251` — tentativa-de-furto-a-banco-em-torres-415251 — 2017-05-11 14:21 — geral — capa: sim
  - **Arquivado:** `415252` — tentativa-de-furto-a-banco-em-torres-415252 — 2017-05-11 14:17 — geral — capa: sim

### 17. "ADMINISTRAÇÃO MUNICIPAL  DE PRAIA GRANDE ADQUIRE VEÍCULO 0KM"

  - **Mantido (published):** `415237` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415237 — 2017-05-18 17:48 — geral — capa: sim
  - **Arquivado:** `415216` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415216 — 2017-05-18 19:48 — geral — capa: não
  - **Arquivado:** `415217` — administracao-municipal-de-praia-grande-adquire-veiculo-0km-415217 — 2017-05-18 19:47 — geral — capa: não

### 18. "SANTA CATARINA TEM MUNICÍPIOS COM ELEVADO RISCO DE TRANSMISSÃO DE DENGUE, FEBRE DE CHIKUNGUNYA E ZIKA VÍRUS"

  - **Mantido (published):** `415235` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415235 — 2017-05-18 18:04 — geral — capa: sim
  - **Arquivado:** `415234` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415234 — 2017-05-18 18:04 — geral — capa: sim
  - **Arquivado:** `415213` — santa-catarina-tem-municipios-com-elevado-risco-de-transmissao-de-dengue-febre-d-415213 — 2017-05-18 20:04 — geral — capa: não

### 19. "SECRETÁRIO ADILSON MOACIR  FALA DO AUMENTO DE ALUNOS NA REDE MUNICIPAL DE ENSINO"

  - **Mantido (published):** `415220` — secretario-adilson-moacir-fala-do-aumento-de-alunos-na-rede-municipal-de-ensino-415220 — 2017-05-18 19:43 — geral — capa: sim
  - **Arquivado:** `415219` — secretario-adilson-moacir-fala-do-aumento-de-alunos-na-rede-municipal-de-ensino-415219 — 2017-05-18 19:43 — geral — capa: não

### 20. "TRAFICANTES SÃO PRESOS EM PASSO DE TORRES"

  - **Mantido (published):** `415208` — traficantes-sao-presos-em-passo-de-torres-415208 — 2017-05-25 17:06 — geral — capa: sim
  - **Arquivado:** `415192` — traficantes-sao-presos-em-passo-de-torres-415192 — 2017-05-25 19:06 — geral — capa: não
  - **Arquivado:** `415191` — traficantes-sao-presos-em-passo-de-torres-415191 — 2017-05-25 19:06 — geral — capa: não

### 21. "PREFEITO MOACIR FALA DA VIAGEM A BRASÍLIA"

  - **Mantido (published):** `415203` — prefeito-moacir-fala-da-viagem-a-brasilia-415203 — 2017-05-25 17:42 — geral — capa: sim
  - **Arquivado:** `415204` — prefeito-moacir-fala-da-viagem-a-brasilia-415204 — 2017-05-25 17:34 — geral — capa: não

### 22. "CAMPANHA DE VACINAÇÃO CONTRA A GRIPE ENCERRA NESTA SEXTA-FEIRA"

  - **Mantido (published):** `415177` — campanha-de-vacinacao-contra-a-gripe-encerra-nesta-sexta-feira-415177 — 2017-05-25 20:02 — geral — capa: não
  - **Arquivado:** `415200` — campanha-de-vacinacao-contra-a-gripe-encerra-nesta-sexta-feira-415200 — 2017-05-25 17:56 — geral — capa: não

### 23. "CASO DE  ESTUPRO  CHOCA A REGIÃO"

  - **Mantido (published):** `415190` — caso-de-estupro-choca-a-regiao-415190 — 2017-05-25 19:08 — geral — capa: sim
  - **Arquivado:** `415189` — caso-de-estupro-choca-a-regiao-415189 — 2017-05-25 19:08 — geral — capa: não

### 24. "CRISTIA ESTÁ ENTRE AS 20 MULHERES MAIS BELAS DO  RIO GRANDE DO SUL"

  - **Mantido (published):** `415127` — cristia-esta-entre-as-20-mulheres-mais-belas-do-rio-grande-do-sul-415127 — 2017-06-14 18:58 — geral — capa: sim
  - **Arquivado:** `415128` — cristia-esta-entre-as-20-mulheres-mais-belas-do-rio-grande-do-sul-415128 — 2017-06-14 18:58 — geral — capa: não

### 25. "CENTENAS DE PESSOAS PRESTIGIARAM A GRANDE FINAL DO CAMPEONATO MUNICIPAL DE FUTEBOL DE MORRINHOS DO SUL"

  - **Mantido (published):** `418522` — centenas-de-pessoas-prestigiaram-a-grande-final-do-campeonato-municipal-de-futeb-418522 — 2017-11-01 16:32 — esporte — capa: sim
  - **Arquivado:** `414603` — centenas-de-pessoas-prestigiaram-a-grande-final-do-campeonato-municipal-de-futeb-414603 — 2017-11-01 16:07 — geral — capa: sim

### 26. "DILCEU SEGUE A FRENTE DA SOCIEDADE ESPORTIVA  E RECREATIVA SÃO JOÃO DO SUL"

  - **Mantido (published):** `414005` — dilceu-segue-a-frente-da-sociedade-esportiva-e-recreativa-sao-joao-do-sul-414005 — 2018-04-13 18:46 — geral — capa: sim
  - **Arquivado:** `414009` — dilceu-segue-a-frente-da-sociedade-esportiva-e-recreativa-sao-joao-do-sul-414009 — 2018-04-13 13:53 — geral — capa: sim

### 27. "DEPUTADO TEBALDI DESTINA MAIS  DE R$ 3 MILHÕES PARA O SUL CATARINENSE"

  - **Mantido (published):** `413967` — deputado-tebaldi-destina-mais-de-r-3-milhoes-para-o-sul-catarinense-413967 — 2018-04-23 14:21 — geral — capa: sim
  - **Arquivado:** `413966` — deputado-tebaldi-destina-mais-de-r-3-milhoes-para-o-sul-catarinense-413966 — 2018-04-23 14:21 — geral — capa: sim

### 28. "VETERANOS DO PASSO MAGNUS EMPATAM EM JOGO DE MUITOS GOLS"

  - **Mantido (published):** `418495` — veteranos-do-passo-magnus-empatam-em-jogo-de-muitos-gols-418495 — 2018-05-25 12:51 — esporte — capa: sim
  - **Arquivado:** `418494` — veteranos-do-passo-magnus-empatam-em-jogo-de-muitos-gols-418494 — 2018-05-25 12:51 — esporte — capa: sim

### 29. "DEFINIDOS OS CONFRONTOS DAS QUARTAS  DE FINAIS DA COPA SUL DOS CAMPEÕES 2019"

  - **Mantido (published):** `418438` — definidos-os-confrontos-das-quartas-de-finais-da-copa-sul-dos-campeoes-2019-418438 — 2019-05-03 12:41 — esporte — capa: sim
  - **Arquivado:** `413117` — definidos-os-confrontos-das-quartas-de-finais-da-copa-sul-dos-campeoes-2019-413117 — 2019-05-03 12:40 — geral — capa: sim

### 30. "FISCAIS AGROPECUÁRIOS DO RS MONITORAM NUVEM DE GAFANHOTOS VINDA DA ARGENTINA"

  - **Mantido (published):** `420318` — fiscais-agropecuarios-do-rs-monitoram-nuvem-de-gafanhotos-vinda-da-argentina-420318 — 2020-06-27 23:10 — agricultura — capa: sim
  - **Arquivado:** `420319` — fiscais-agropecuarios-do-rs-monitoram-nuvem-de-gafanhotos-vinda-da-argentina-420319 — 2020-06-27 23:01 — agricultura — capa: sim

### 31. "BM E PC PRENDEM HOMEM SUSPEITO DE HOMICÍDIO EM MORRINHOS DO SUL"

  - **Mantido (published):** `419193` — bm-e-pc-prendem-homem-suspeito-de-homicidio-em-morrinhos-do-sul-419193 — 2020-08-30 19:53 — policia — capa: sim
  - **Arquivado:** `419192` — bm-e-pc-prendem-homem-suspeito-de-homicidio-em-morrinhos-do-sul-419192 — 2020-08-30 19:53 — policia — capa: sim

### 32. "FETAG-RS LANÇA  ABAIXO-ASSINADO CONTRA A REFORMA DA PREVIDÊNCIA"

  - **Mantido (published):** `413287` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413287 — 2019-03-08 12:19 — geral — capa: sim
  - **Arquivado:** `413291` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413291 — 2019-03-08 12:13 — geral — capa: sim
  - **Arquivado:** `413292` — fetag-rs-lanca-abaixo-assinado-contra-a-reforma-da-previdencia-413292 — 2019-03-08 12:10 — geral — capa: sim

### 33. "NINGUÉM ACERTA AS CINCO DEZENAS DA QUINA DE SÃO JOÃO"

  - **Mantido (published):** `412941` — ninguem-acerta-as-cinco-dezenas-da-quina-de-sao-joao-412941 — 2019-06-25 12:43 — geral — capa: sim
  - **Arquivado:** `412942` — ninguem-acerta-as-cinco-dezenas-da-quina-de-sao-joao-412942 — 2019-06-25 12:43 — geral — capa: não

### 34. "PREFEITO DE TORRES  ENTREGA AMBULÂNCIAS  ADESIVADAS PARA A SAÚDE"

  - **Mantido (published):** `412812` — prefeito-de-torres-entrega-ambulancias-adesivadas-para-a-saude-412812 — 2019-08-02 12:51 — geral — capa: sim
  - **Arquivado:** `412813` — prefeito-de-torres-entrega-ambulancias-adesivadas-para-a-saude-412813 — 2019-08-02 12:51 — geral — capa: não

### 35. "SUCESSO NA FESTA DO PADROEIRO SÃO DOMINGOS"

  - **Mantido (published):** `412779` — sucesso-na-festa-do-padroeiro-sao-domingos-412779 — 2019-08-09 13:56 — geral — capa: sim
  - **Arquivado:** `412780` — sucesso-na-festa-do-padroeiro-sao-domingos-412780 — 2019-08-09 13:55 — geral — capa: sim

### 36. "'BELEZAS NATURAIS DE TORRES' É O TEMA DA SEMANA DA PÁTRIA 2019"

  - **Mantido (published):** `412728` — belezas-naturais-de-torres-e-o-tema-da-semana-da-patria-2019-412728 — 2019-08-21 16:39 — geral — capa: sim
  - **Arquivado:** `412729` — belezas-naturais-de-torres-e-o-tema-da-semana-da-patria-2019-412729 — 2019-08-21 16:39 — geral — capa: não

### 37. "GÁS VEICULAR PASSARÁ A SER COMERCIALIZADO EM QUILOGRAMA, EM 2020"

  - **Mantido (published):** `411644` — gas-veicular-passara-a-ser-comercializado-em-quilograma-em-2020-411644 — 2019-12-18 22:11 — geral — capa: sim
  - **Arquivado:** `411646` — gas-veicular-passara-a-ser-comercializado-em-quilograma-em-2020-411646 — 2019-12-18 22:11 — geral — capa: não

### 38. "HOSPITAL REGIONAL DE ARARANGUÁ RECEBERÁ SERVIÇOS DE REFERÊNCIA EM OFTALMOLOGIA, UROLOGIA E ORTOPEDIA"

  - **Mantido (published):** `411084` — hospital-regional-de-ararangua-recebera-servicos-de-referencia-em-oftalmologia-u-411084 — 2020-02-17 18:26 — geral — capa: sim
  - **Arquivado:** `411086` — hospital-regional-de-ararangua-recebera-servicos-de-referencia-em-oftalmologia-u-411086 — 2020-02-17 18:26 — geral — capa: não

### 39. "MAIS DE 200 CARROS PARTICIPAM DE CARREATA DE JONAS E ÁUREO EM PASSO DE TORRES"

  - **Mantido (published):** `419512` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419512 — 2020-10-13 20:40 — politica — capa: sim
  - **Arquivado:** `419513` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419513 — 2020-10-13 20:32 — politica — capa: sim
  - **Arquivado:** `419514` — mais-de-200-carros-participam-de-carreata-de-jonas-e-aureo-em-passo-de-torres-419514 — 2020-10-13 20:31 — politica — capa: sim

### 40. "SETOR DE TRANSPORTE DE CARGAS ACUMULA QUEDAS DE 45,2% A NÍVEL NACIONAL"

  - **Mantido (published):** `410160` — setor-de-transporte-de-cargas-acumula-quedas-de-45-2-a-nivel-nacional-410160 — 2020-04-22 20:06 — geral — capa: sim
  - **Arquivado:** `410162` — setor-de-transporte-de-cargas-acumula-quedas-de-45-2-a-nivel-nacional-410162 — 2020-04-22 20:06 — geral — capa: não

### 41. "EDUCAÇÃO CRIA PLANO DE AÇÕES PEDAGÓGICAS PARA O PERÍODO DE SUSPENSÃO DAS AULAS"

  - **Mantido (published):** `410124` — educacao-cria-plano-de-acoes-pedagogicas-para-o-periodo-de-suspensao-das-aulas-410124 — 2020-04-24 17:09 — geral — capa: sim
  - **Arquivado:** `410126` — educacao-cria-plano-de-acoes-pedagogicas-para-o-periodo-de-suspensao-das-aulas-410126 — 2020-04-24 17:09 — geral — capa: não

### 42. "GOVERNO DE SC DIVULGA NOTA DE ESCLARECIMENTO SOBRE DENÚNCIAS DO THE INTERCEPT"

  - **Mantido (published):** `419651` — governo-de-sc-divulga-nota-de-esclarecimento-sobre-denuncias-do-the-intercept-419651 — 2020-04-28 23:06 — politica — capa: sim
  - **Arquivado:** `410071` — governo-de-sc-divulga-nota-de-esclarecimento-sobre-denuncias-do-the-intercept-410071 — 2020-04-28 23:06 — geral — capa: não

### 43. "MAIS DE MIL MUNICÍPIOS TERÃO R$ 598 MILHÕES EM EMENDAS PARLAMENTARES"

  - **Mantido (published):** `409758` — mais-de-mil-municipios-terao-r-598-milhoes-em-emendas-parlamentares-409758 — 2020-05-19 17:43 — geral — capa: sim
  - **Arquivado:** `409761` — mais-de-mil-municipios-terao-r-598-milhoes-em-emendas-parlamentares-409761 — 2020-05-19 17:43 — geral — capa: não

### 44. "SANTA CATARINA BATE RECORDE NA EXPORTAÇÃO DE SOJA NOS QUATRO PRIMEIROS MESES DO ANO"

  - **Mantido (published):** `409744` — santa-catarina-bate-recorde-na-exportacao-de-soja-nos-quatro-primeiros-meses-do--409744 — 2020-05-20 12:32 — geral — capa: sim
  - **Arquivado:** `409742` — santa-catarina-bate-recorde-na-exportacao-de-soja-nos-quatro-primeiros-meses-do--409742 — 2020-05-20 12:32 — geral — capa: não

### 45. "ALESC PRORROGA DECRETO DE ESTADO DE CALAMIDADE PÚBLICA ATÉ 31 DE MARÇO"

  - **Mantido (published):** `407481` — alesc-prorroga-decreto-de-estado-de-calamidade-publica-ate-31-de-marco-407481 — 2020-12-16 22:18 — geral — capa: sim
  - **Arquivado:** `407485` — alesc-prorroga-decreto-de-estado-de-calamidade-publica-ate-31-de-marco-407485 — 2020-12-16 19:02 — geral — capa: sim

### 46. "MPSC DENUNCIA HOMEM POR DIVULGAÇÃO DE FAKE NEWS SOBRE COVID-19 EM SÃO LUDGERO"

  - **Mantido (published):** `419345` — mpsc-denuncia-homem-por-divulgacao-de-fake-news-sobre-covid-19-em-sao-ludgero-419345 — 2020-05-21 12:08 — policia — capa: sim
  - **Arquivado:** `419346` — mpsc-denuncia-homem-por-divulgacao-de-fake-news-sobre-covid-19-em-sao-ludgero-419346 — 2020-05-21 12:08 — policia — capa: não

### 47. "MOACIR E EDINHO E VEREADORES FAZEM A FESTA DA VITÓRIA NAS ELEIÇÕES EM SÃO JOÃO DO SUL"

  - **Mantido (published):** `419449` — moacir-e-edinho-e-vereadores-fazem-a-festa-da-vitoria-nas-eleicoes-em-sao-joao-d-419449 — 2020-11-16 12:49 — politica — capa: sim
  - **Arquivado:** `419450` — moacir-e-edinho-e-vereadores-fazem-a-festa-da-vitoria-nas-eleicoes-em-sao-joao-d-419450 — 2020-11-16 12:48 — politica — capa: sim

### 48. "SICOOB CREDISULCA TRANSFORMA UNIFORMES ANTIGOS EM MÁSCARAS E AUXILIA COLABORADORES NO COMBATE AO CORONAVÍRUS"

  - **Mantido (published):** `418156` — sicoob-credisulca-transforma-uniformes-antigos-em-mascaras-e-auxilia-colaborador-418156 — 2020-04-24 12:20 — saude — capa: sim
  - **Arquivado:** `418155` — sicoob-credisulca-transforma-uniformes-antigos-em-mascaras-e-auxilia-colaborador-418155 — 2020-04-24 12:20 — saude — capa: não

### 49. "CINCO LEITOS DE UTI DO HOSPITAL DE TORRES SÃO HABILITADOS PELO GOVERNO DO RIO GRANDE DO SUL"

  - **Mantido (published):** `418097` — cinco-leitos-de-uti-do-hospital-de-torres-sao-habilitados-pelo-governo-do-rio-gr-418097 — 2020-05-04 18:58 — saude — capa: sim
  - **Arquivado:** `418098` — cinco-leitos-de-uti-do-hospital-de-torres-sao-habilitados-pelo-governo-do-rio-gr-418098 — 2020-05-04 18:58 — saude — capa: não

### 50. "RESPIRADORES DA VEIGAMED REPRESENTAM 70% DE TODO O GASTO DO GOVERNO CONTRA O CORONAVÍRUS"

  - **Mantido (published):** `418001` — respiradores-da-veigamed-representam-70-de-todo-o-gasto-do-governo-contra-o-coro-418001 — 2020-05-20 18:51 — saude — capa: sim
  - **Arquivado:** `418004` — respiradores-da-veigamed-representam-70-de-todo-o-gasto-do-governo-contra-o-coro-418004 — 2020-05-20 15:39 — saude — capa: sim

### 51. "COVID-19: MEDIDAS DE DISTANCIAMENTO SOCIAL SALVAM VIDAS NO ESTADO"

  - **Mantido (published):** `417997` — covid-19-medidas-de-distanciamento-social-salvam-vidas-no-estado-417997 — 2020-05-21 20:41 — saude — capa: sim
  - **Arquivado:** `417996` — covid-19-medidas-de-distanciamento-social-salvam-vidas-no-estado-417996 — 2020-05-21 20:41 — saude — capa: sim

### 52. "SANTA CATARINA REGISTRA 5.610 CASOS E 98 ÓBITOS POR COVID-19"

  - **Mantido (published):** `417995` — santa-catarina-registra-5610-casos-e-98-obitos-por-covid-19-417995 — 2020-05-21 21:09 — saude — capa: sim
  - **Arquivado:** `417994` — santa-catarina-registra-5610-casos-e-98-obitos-por-covid-19-417994 — 2020-05-21 21:09 — saude — capa: sim

### 53. "TORRES TEM BANDEIRA AMARELA NO DISTANCIAMENTO CONTROLADO DO GOVERNO DO ESTADO"

  - **Mantido (published):** `417974` — torres-tem-bandeira-amarela-no-distanciamento-controlado-do-governo-do-estado-417974 — 2020-05-25 18:57 — saude — capa: sim
  - **Arquivado:** `417975` — torres-tem-bandeira-amarela-no-distanciamento-controlado-do-governo-do-estado-417975 — 2020-05-25 18:57 — saude — capa: não

### 54. "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"

  - **Mantido (published):** `420122` — homem-reencontra-a-familia-apos-26-anos-desaparecido-420122 — 2020-09-26 18:34 — sociais — capa: sim
  - **Arquivado:** `420123` — homem-reencontra-a-familia-apos-26-anos-desaparecido-420123 — 2020-09-26 18:29 — sociais — capa: sim


## O que NÃO foi feito

- Os 11 grupos "precisa inspeção manual" (corpo de tamanho quase idêntico, hash diferente) continuam intactos — aguardam decisão humana caso a caso.
- Os 3 grupos "legítimos" continuam intactos.
- Nenhum artigo foi apagado; os 61 arquivados continuam recuperáveis (mudar `status` de volta para `published` reverteria integralmente, sem perda de dados).

Dados brutos completos: `scripts/legacy-audit/output/duplicate-cleanup-plan.json` (não versionado — derivado).
