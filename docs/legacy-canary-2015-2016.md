# Canário real — lote 2015-2016 (20 matérias)

Gerado em: 2026-09-26

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `8f4f137`, veredito "APROVADO PARA CANÁRIO REAL PEQUENO"). Execução real feita pelo usuário localmente, com a credencial carregada só de `.env.local` (nunca exposta em chat, log ou arquivo versionado). Validação e relatório feitos depois, em modo somente leitura.

## Comando executado (duas vezes, para testar idempotência)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit --limit=20 --rps=4
```

## Contagens no banco — antes / depois da 1ª execução / depois da 2ª execução

| Métrica | Antes | Depois da 1ª execução | Depois da 2ª execução (idempotência) |
|---|---|---|---|
| `articles` com `origin=legacy_site` | 0 | 20 | 20 (inalterado) |
| `article_external_sources` (provider legado) | 0 | 20 | 20 (inalterado) |
| `media_assets` com `origin_source_url` | 0 | 45 | 45 (inalterado) |
| `article_media` (vínculos) | 0 | 45 | 45 (inalterado) |
| `legacy_migration_batches.status` | (sem linha) | `incomplete` | `incomplete` |

`incomplete` é o esperado: `--limit=20` cobre só 20 de 1.622 elegíveis e 45 de 3.025 referências de imagem — o lote só pode virar `complete` quando o restante for importado (não é este canário).

## Resultado bruto de cada execução

**1ª execução (gravação real):**
```json
{ "imported": 20, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 45, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 0 }
```

**2ª execução (idempotência — mesmo comando, sem limpar nada):**
```json
{ "imported": 0, "skippedExisting": 20, "failedArticles": 0,
  "uploadedImages": 0, "reusedImages": 0, "alreadyLinkedImages": 45,
  "correctedImages": 0, "failedImages": 0 }
```

Nenhuma matéria, mídia ou vínculo duplicado; nenhuma ordem/role mudou. `correctedImages: 0` confirma que a reconciliação não precisou consertar nada (porque nada estava errado).

## Validação direta no Supabase (não só os contadores do script)

Script `scripts/legacy-audit/canary-validate.mjs` (novo, somente leitura) confere, para CADA uma das 20 matérias, contra o banco real:

- exatamente 1 `article_external_sources`;
- `origin = legacy_site`;
- `locality = geral`;
- **nenhuma `article_placements`** (nenhuma capa/faixa/últimas/mais destaques criada automaticamente);
- corpo (`body`) sem marcação de menu/publicidade/relacionadas/sidebar/rodapé;
- título e data batem com o legado (dia correto, ver seção de horário abaixo);
- quantidade de imagens bate com o esperado;
- capa com `role=cover` e `sort_order=0`;
- galeria na ordem original;
- `media_assets.origin_source_url` aponta para a URL antiga real;
- `media_assets.public_url` aponta para o bucket próprio (`article-media`);
- o objeto realmente existe no Storage (`storage.list` confirmado, não só a URL).

**Resultado: `allOk: true` — as 20 matérias e as 45 imagens passaram em todas as checagens, nas duas rodadas (antes e depois da 2ª execução).**

Dados completos: `scripts/legacy-audit/output/batches/2015-2016/canary-validation.json` (não versionado — derivado).

## Data/hora

Decisão do usuário (via `docs/CHATGPT_REVIEW.md`): prioridade é o **dia** correto; diferença de 1h por horário de verão não bloqueia. Confirmado nas 20: todas mantêm a data `2015-08-01`, com hora real preservada (ex.: `13:08`, `13:20`, `19:53` — variando conforme o horário real de publicação de cada matéria, não um valor fixo). Valor bruto original preservado em `article_external_sources.raw_metadata`.

## As 20 identidades importadas

| # | Slug novo | external_id | Editoria | Publicado em (UTC) |
|---|---|---|---|---|
| 1 | marco-historico-da-comunidade-de-passo-magnus-e-reconstruido-416756 | 416756 | geral | 2015-08-01T13:08:00Z |
| 2 | inauguracao-da-ponte-de-passo-magnus-416755 | 416755 | geral | 2015-08-01T13:20:00Z |
| 3 | ponte-anita-garibaldi-e-inaugurada-em-laguna-416754 | 416754 | geral | 2015-08-01T13:30:00Z |
| 4 | cdl-faz-doacao-de-camisetas-a-apae-de-praia-grande-416753 | 416753 | geral | 2015-08-01T13:42:00Z |
| 5 | x-conferencia-municipal-de-assistencia-social-e-realizada-em-passo-de-torres-416752 | 416752 | geral | 2015-08-01T13:56:00Z |
| 6 | marlon-selva-palestra-sobre-bioarte-e-sustentabilidade-em-capao-da-canoa-416751 | 416751 | geral | 2015-08-01T14:49:00Z |
| 7 | terceira-conferencia-municipal-de-saude-e-realizada-em-sao-joao-do-sul-416750 | 416750 | geral | 2015-08-01T14:51:00Z |
| 8 | ciclo-de-palestras-para-beneficiarios-do-pbf-em-praia-grande-encerra-com-sucesso-416749 | 416749 | geral | 2015-08-01T14:53:00Z |
| 9 | inicia-a-construcao-da-rede-de-agua-tratada-em-vila-santa-catarina-416748 | 416748 | geral | 2015-08-01T15:01:00Z |
| 10 | sao-joao-do-sul-realiza-capacitacao-para-merendeiras-e-serventes-416747 | 416747 | geral | 2015-08-01T19:53:00Z |
| 11 | dj-rodrigo-pe-exemplo-de-superacao-416746 | 416746 | geral | 2015-08-01T19:54:00Z |
| 12 | dia-da-familia-na-escola-e-realizado-na-eeb-caetano-lummertz-416745 | 416745 | geral | 2015-08-01T19:57:00Z |
| 13 | sindicato-dos-trabalhores-rurais-de-sao-joao-do-sul-e-passo-de-torres-realiza-as-416744 | 416744 | geral | 2015-08-01T20:01:00Z |
| 14 | 5-marcha-das-margaridas-416743 | 416743 | geral | 2015-08-01T20:04:00Z |
| 15 | governo-repassa-as-sdrs-a-manutencao-das-rodovias-estaduais-416742 | 416742 | geral | 2015-08-01T20:07:00Z |
| 16 | produtores-de-morango-de-sao-joao-do-sul-recebem-visita-de-pesquisadores-da-epag-416741 | 416741 | geral | 2015-08-01T20:18:00Z |
| 17 | praia-grande-homenageia-os-caminhoneiros-e-agricultores-na-festa-em-honra-a-sao--416740 | 416740 | geral | 2015-08-01T20:22:00Z |
| 18 | emef-vila-nova-realiza-arraia-em-curralinhos-416739 | 416739 | geral | 2015-08-01T20:32:00Z |
| 19 | jovens-recebem-certificado-de-dispensa-do-servico-militar-em-sao-joao-do-sul-416738 | 416738 | geral | 2015-08-01T20:34:00Z |
| 20 | policia-militar-de-sao-joao-do-sul-adquire-novos-uniformes-416737 | 416737 | geral | 2015-08-01T20:37:00Z |

Todas as 20 são da editoria `geral` — resultado natural da ordem determinística do preflight (mais antigas primeiro, dentro da categoria de maior volume no lote), não um viés do canário. Confirma que o canário testou um dia real completo (01/08/2015) do site legado.

## Achado durante a validação (não relacionado aos 3 bloqueios, não bloqueante)

O título da matéria #11 (`external_id 416746`) contém um caractere `?` isolado onde o site original provavelmente tinha um travessão (`DJ RODRIGO PÉ ? EXEMPLO DE SUPERAÇÃO` — o slug legado, `dj_rodrigo_pe__exemplo_de_superacao`, sugere um separador ali). Verificado: **é um problema de decodificação já presente no cache de coleta da Fase 34/35** (não introduzido pela gravação no Supabase) e **isolado** — apenas 1 em 1.635 títulos do lote inteiro têm esse padrão. Não foi corrigido nesta etapa (fora do escopo do canário); registrado aqui para follow-up futuro (possível revisão manual pontual ou ajuste de charset na próxima leitura dessa página específica).

## Conclusão

Canário aprovado tecnicamente: 20/20 matérias e 45/45 imagens corretas e verificadas diretamente no banco/Storage, idempotência confirmada (2ª execução não duplicou nada e não alterou nenhuma ordem/role). `legacy_migration_batches` permanece `incomplete`, como deveria.

**Nenhuma ação além deste canário foi tomada** — as outras 1.602 matérias elegíveis do lote 2015-2016 não foram importadas, aguardando nova conferência do ChatGPT.
