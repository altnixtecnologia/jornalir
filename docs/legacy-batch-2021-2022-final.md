# Lote 2021-2022 — CONCLUÍDO

Gerado em: 2026-09-27

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `d466533`, veredito "AUTORIZADA AGORA — carga real 2021-2022", usando o cache já sanitizado pela Fase 44C, sem refetch e sem `--limit`).

## Comando (executado duas vezes)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2021-2022 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução (completa):**
```json
{ "imported": 4475, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 6888, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 1 }
```
Lote: `incomplete` (6.888/6.889 imagens reconciliadas). A 1 falha foi `Gateway Timeout` — mesma classe de erro transitório já vista nos lotes anteriores, bem dentro do limite "pontual" (nunca dezenas/centenas).

**2ª execução (retry, sem `--limit`):**
```json
{ "imported": 0, "skippedExisting": 4475, "failedArticles": 0,
  "uploadedImages": 1, "reusedImages": 0, "alreadyLinkedImages": 6888,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (6.889/6.889 imagens reconciliadas).

## A imagem com falha transitória

| URL original | Erro na 1ª tentativa | Artigo | Resolução |
|---|---|---|---|
| `https://suitacdn.cloud-bricks.net/fotos/616681/file/desktop/16143452606100.jpg?1675040227` | Gateway Timeout | `quadro-de-distribuicao-de-energia-de-empresa-e-furtado-em-sao-joao-do-sul-406845` | Reconciliada no retry |

Volume (1 em 6.889, transitória e resolvida) não se aproxima do limiar "dezenas/centenas" que exigiria parar e investigar.

## Validação final — batch-scoped, direto no Supabase (`batch-final-validate.mjs --batch=2021-2022`)

| Checagem (escopada só a este lote) | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` deste lote | 4.475 | 4.475 | ✅ |
| `article_external_sources` deste lote | 4.475 | 4.475 | ✅ |
| Slugs únicos neste lote | 4.475 | 4.475 | ✅ |
| `media_assets` deste lote | 6.889 | 6.889 | ✅ |
| `article_media` (vínculos) deste lote | 6.889 | 6.889 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 4.469 | 4.469 | ✅ |
| Artigos com 0 imagens | 6 | 6 | ✅ |
| `article_placements` para matérias deste lote | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (13) vazados para a carga | 0 | 0 | ✅ |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs deste lote | 2/2 | 2/2 | ✅ |

## Checagem GLOBAL (todos os 4 lotes já migrados — nunca duplicar entre lotes)

| Checagem | Valor |
|---|---|
| Total de `articles` (2015-2016 + 2017-2018 + 2019-2020 + 2021-2022) | 13.688 |
| Slugs únicos globais | 13.688 (nenhuma colisão entre lotes) |
| Total de `article_external_sources` globais | 13.688 |
| `external_id`/`source_url` únicos globais | 13.688 / 13.688 (0 duplicidade por identidade) |
| Total de `media_assets` globais | 21.089 |
| `origin_source_url` únicos globais | 21.089 (nenhuma imagem duplicada entre lotes) |
| `storage_path` únicos globais | 21.089 |

Aritmética confirmada: 1.622 + 2.503 + 5.088 + 4.475 = 13.688 articles. Nenhuma matéria dos lotes 2015-2020 foi alterada por esta carga (exceto os 203 registros já corrigidos separadamente na Fase 44D, antes desta carga).

## Auditoria de candidatos a duplicata (SOMENTE LEITURA — nada arquivado)

Rodada após a carga, reaproveitando a mesma regra editorial confirmada (título sozinho nunca decide; título+data é só candidato; confirmação exige corpo idêntico/quase idêntico). Ver relatório completo em `docs/legacy-duplicate-audit-2021-2022.md`.

**Resumo:**
- 54 grupos já resolvidos na Fase 43 (esperado — não são achados novos).
- **11 candidatos novos envolvendo 2021-2022** — nenhum arquivado, registrados para revisão futura.
- **Achado inesperado (efeito colateral correto da Fase 44D):** a sanitização do resíduo de `<img>` quebrada em 2 pares de artigos de 2019-2020 (que antes só divergiam pelo resíduo) revelou que os corpos são agora **idênticos byte-a-byte** — casos que antes ficavam na faixa "precisa inspeção manual" (ou, num caso, tinham sido classificados como coincidência legítima) viraram duplicata confirmada. Nenhum arquivamento foi feito; fica registrado para decisão explícita numa próxima etapa.

## Período coberto pelo lote (confirmado no banco)

- Intervalo do lote: `2021-01-01` a `2022-12-31`.

## Categorias na carga real

Sem categoria nova em relação ao preflight aprovado — distribuição idêntica: colunistas=82, geral=3.377, esporte=86, policia=208, politica=40, saude=586, sociais=37, agricultura=59.

## O que ficou de fora (por design)

- **13 casos `needs_review`** (ver `docs/legacy-review-2021-2022.md`) — continuam fora da carga automática.
- **7 exceções de data** — mesmas 7 globais já documentadas desde a Fase 34.
- **`classificados`** — não apareceu neste intervalo (0 itens); continua em quarentena automática.

## Conclusão

**Lote 2021-2022: 4.475/4.475 matérias elegíveis migradas, 6.889/6.889 referências de imagem reconciliadas, 0 falhas finais, 0 duplicatas por identidade (nem dentro do lote, nem contra os 3 lotes anteriores).** `legacy_migration_batches.status = complete`.

**Não iniciado o lote 2023-2024** — aguardando nova conferência do ChatGPT.
