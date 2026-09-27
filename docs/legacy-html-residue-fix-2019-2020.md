# Correção pontual do resíduo HTML em 203 artigos já importados — 2019-2020 (Fase 44D)

Correção autorizada por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `b4c1540`), aplicada **sem refetch e sem reexecutar o lote 2019-2020** — usando exclusivamente o cache local já existente (`output/inventory.ndjson` + `output/batches/2019-2020/details.ndjson`, ambos nunca tocados desde a coleta original).

## Contexto

A Fase 44C (análise/sanitização do vazamento de `<img>` quebrada em 2021-2022) encontrou, na checagem preventiva dos caches antigos, o mesmo padrão em **203 artigos do lote 2019-2020, já importados e publicados em produção** (`legacy_migration_batches.status = complete`). Esta fase corrige pontualmente esses 203 registros.

## Ferramentas criadas

- `scripts/legacy-audit/fix-imported-html-residue.mjs` — dry-run por padrão; `--commit` aplica.
- `scripts/legacy-audit/validate-html-residue-fix.mjs` — validação somente leitura pós-correção.

## Procedimento executado

1. Carregado `output/inventory.ndjson` (candidatos globais) e filtrado para o intervalo de 2019-2020, reaproveitando `lib/pipeline.mjs` (mesma lógica usada no preflight/import — nenhuma reimplementação divergente).
2. Carregado `output/batches/2019-2020/details.ndjson` (cache de detalhes, nunca sanitizado — preserva o `bodyHtml` exatamente como foi importado originalmente).
3. Para cada candidato no intervalo, aplicado `sanitizeBodyHtml()` (mesma função da Fase 44C) sobre o `bodyHtml` em cache; os que tiveram algum fragmento removido (`removedCount > 0`) viraram alvo — **203 artigos**, batendo exatamente com o número da Fase 44C.
4. Para cada alvo:
   - localizada a linha em `article_external_sources` por `provider=informativo_regional_legacy` + `external_id`;
   - carregado `articles.body` atual via `article_id`;
   - comparado **byte a byte** o `body` atual no banco contra o `bodyHtml` original do cache (o valor exato que o importador gravou na Fase 41);
   - **só entrou no plano de correção quando os dois batessem exatamente**.
5. **Dry-run** (`node --env-file=".env.local" fix-imported-html-residue.mjs`): 203/203 alvos encontrados no banco, corpo atual idêntico ao esperado do cache em 100% dos casos, **0 conflito manual, 0 "não encontrado"**.
6. Como o dry-run bateu exatamente com os 203 esperados e zero conflito, aplicada a correção real (`--commit`):
   - `articles.body` atualizado para o `bodyHtml` sanitizado (só remove o resíduo — nunca texto editorial);
   - `article_external_sources.source_hash` recalculado com a MESMA função `sourceHash()` do importador, usando o `bodyTextFull` recomputado a partir do HTML sanitizado;
   - nenhum outro campo tocado (título, subtítulo, datas, editoria, localidade, autoria, external_id, source_url, status, mídias — todos preservados);
   - nenhum `DELETE`, nenhuma reabertura/reexecução do lote, nenhum refetch de rede.

## Resultado da aplicação

**203/203 registros corrigidos com sucesso.** Nenhum conflito manual encontrado (nenhuma edição manual pós-migração detectada nesses 203 artigos).

## Validação pós-correção

Executada via `validate-html-residue-fix.mjs` (somente `SELECT`, nenhuma escrita):

| Checagem | Resultado |
|---|---|
| Artigos corrigidos (sem mais resíduo no `body`) | **203 / 203** |
| Artigos ainda com resíduo | **0** |
| Não encontrados no banco | **0** |
| Total físico de `articles` | **9.213** (inalterado) |
| Total de `article_external_sources` | **9.213** (inalterado) |
| Total de `article_media` | **14.200** (inalterado — nenhuma mídia tocada) |
| `legacy_migration_batches` (2019-2020) | `status: "complete"`, `imported_articles: 0`, `skipped_existing: 5088`, `failed_articles: 0` — **inalterado**, lote não foi reaberto/reexecutado |

## Nenhuma escrita fora do escopo

- Nenhum dos outros 8.212 artigos (2015-2016, 2017-2018, e os 4.885 de 2019-2020 sem o vazamento) foi tocado.
- Nenhuma mídia (`media_assets`/`article_media`) alterada.
- Nenhum status (`published`/`archived`) alterado.
- Nenhum refetch de rede em nenhum momento desta fase.
- Nenhuma importação real de 2021-2022 nesta etapa — continua pendente de autorização explícita.
