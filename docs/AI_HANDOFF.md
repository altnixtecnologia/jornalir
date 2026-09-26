# Handoff entre Claude e ChatGPT

Este arquivo é atualizado ao final de CADA fase a partir da Fase 35. Curto, direto, conferível pelo GitHub sem precisar rodar nada.

---

## Fase 35 — Motor de migração + preflight do lote 2015–2016 (ainda sem gravação)

**HEAD/commit:** `5f58ce4` (branch `feature/jornalir-core-foundation-20260917`)

### O que foi feito

- Migration `20261002100000_legacy_migration_batches.sql` aplicada: adiciona editorias `Agricultura` e `Classificados` (faltavam na auditoria da Fase 34) e cria a tabela `legacy_migration_batches` (staff-only, controla status/contadores de cada lote, retomável).
- Motor de migração reutilizável em `scripts/legacy-audit/migrate.mjs` + `lib/identity.mjs` (deduplicação por `provider+external_id` ou `provider+URL normalizada`, slug estável e determinístico) + `lib/batches.mjs` (plano oficial dos 6 lotes de 2 anos, mapeamento categoria legada → editoria).
- `lib/parse.mjs` ganhou extração de `bodyHtml` real (preserva `<p>`/`<strong>`/quebras) e sinalizadores estruturais (`entryHeaderCount`, `entryContentCount`, `coverSource`, `suspiciousBodyElements`) usados pela barreira de integridade.
- **Barreira de integridade editorial** (`scripts/legacy-audit/lib/integrity.mjs`, pedido explícito do usuário nesta fase): uma matéria só é `eligible` quando título, data, corpo e imagens vêm exclusivamente da estrutura própria da página (`.entry-header`/`.entry-content`/capa/galeria — nunca menu, publicidade, relacionadas, rodapé ou sidebar). Qualquer ambiguidade (estrutura duplicada, título/data divergentes entre listagem e detalhe, corpo vazio/curto, elemento de bloco não-editorial dentro do corpo, capa só via fallback `og:image`, imagem fora do host de mídia conhecido) vira `needs_review` — nunca é importada nem descartada.
  - **Achado real durante o ajuste da barreira**: a primeira versão testava padrões como "relacionad"/"publicidade" como substring solta no HTML serializado, o que gerava falso-positivo em texto comum (ex.: a palavra "relacionada" numa frase qualquer). Corrigido para checar a estrutura DOM real via seletores cheerio (`.ts-grid-box`, `.carousel-item`, `[class*='sidebar']` etc.), nunca substring em texto livre.
  - Um dos 13 itens finais de `needs_review` revelou um achado genuíno: uma matéria antiga (`nota_de_falecimento.416251`) tem corpo real, mas envolvido em tags `<h2>` em vez de `<p>` — e suas imagens vêm de `/polopoly_fs/...`, evidência de uma TERCEIRA era de CMS no histórico do site (além das duas já documentadas na Fase 34). Corretamente sinalizado para revisão manual, não importado às cegas.
- Preflight do lote 2015–2016 calculado a partir do inventário completo da Fase 34 (`scripts/legacy-audit/output/inventory.ndjson`) + busca real da página de cada uma das 1.635 matérias candidatas do intervalo (somente leitura — nenhuma escrita no Supabase).
- `docs/legacy-migration-status.json` criado/atualizado com o plano oficial dos 6 lotes e os números reais do preflight de 2015–2016.

### Migrations

- `20261002100000_legacy_migration_batches.sql` — aplicada com sucesso via `supabase db push`.

### Testes

- `migrate.mjs --mode=preflight` rodado de ponta a ponta contra o site real para o lote 2015–2016, três vezes (as duas primeiras revelaram bugs na barreira de integridade — cache desatualizado após mudar o parser, depois falso-positivo de substring — corrigidos e revalidados na terceira rodada).
- **Nenhum modo `import` foi executado nesta fase, nem em dry-run** — por instrução explícita do usuário ("não solicitar nem usar service-role nesta etapa", "PARE antes de qualquer escrita real"). O código de importação existe (`runImport`/`importCandidate` em `migrate.mjs`) mas não foi exercitado ainda.

### BLOQUEIO — pendência de credencial

A importação real (`--mode=import --commit`) vai precisar de `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ou uma sessão autenticada de staff) no ambiente quando for autorizada — nenhuma das duas foi solicitada ou usada nesta fase, por instrução explícita do usuário.

**Nenhuma matéria ou imagem foi gravada no Supabase.** Esta fase terminou no preflight.

### Quantidades (preflight do lote 2015–2016, números reais)

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (já deduplicadas por identidade) | 1.635 |
| Exceções de data (`31/12/1969`, fora de qualquer lote automático) | 7 |
| **Elegíveis** (passaram na barreira de integridade) | **1.622** |
| **Precisam de revisão manual** (`needs_review`) | **13** |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 1.506 |
| Sem imagem | 116 |
| Referências de imagem (capa + galeria, elegíveis) | 3.025 |
| URLs de imagem únicas (elegíveis) | 3.025 |
| Distribuição por editoria (elegíveis) | geral=1.114, esporte=231, política=228, sociais=49 |

Arquivos completos: `scripts/legacy-audit/output/batches/2015-2016/{preflight.json, date-exceptions.json, needs-review.json, rejected.json}` (não versionados — grandes/derivados, ver `.gitignore`).

### Erros

Nenhum erro de rede/parse na busca de detalhe (0 rejeitadas). 7 itens com data bugada (`31/12/1969 21:00`) continuam fora de qualquer lote automático. 13 itens em `needs_review` (ver lista completa em `needs-review.json`): 10 com corpo vazio real (inclusive um caso de corpo em `<h2>` de uma era de CMS ainda mais antiga, "Polopoly"), 1 com corpo de 2 caracteres (nota social tipo "QUADRO"), 2 outros com corpo vazio.

### Pendências

1. Usuário precisa decidir e fornecer a credencial de escrita (service role ou sessão staff) quando quiser autorizar a gravação real — não solicitada nesta fase.
2. Revisão manual dos 13 itens em `needs_review` antes de decidir o destino de cada um (importar manualmente corrigido, ou manter fora).
3. Após a gravação real (quando autorizada), rodar a reconciliação (item 16 da Fase 35) e só então marcar o lote como `complete` em `legacy_migration_batches`.
4. Não iniciar 2017–2018 antes da conferência completa do lote 2015–2016.

### Próximo passo recomendado

Aguardar decisão do usuário sobre credencial de escrita e sobre os 13 itens de `needs_review`. Só então rodar `node scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit` (grava só os 1.622 elegíveis), validar a reconciliação e atualizar este arquivo + `docs/legacy-migration-status.json` com os números finais.

---

## Fase 35B — Hardening final antes da primeira gravação (ainda sem gravação)

**HEAD/commit:** `17e6e1e` (branch `feature/jornalir-core-foundation-20260917`)

### O que foi feito

Nenhuma matéria/imagem foi gravada — esta fase é exclusivamente hardening do motor pedido antes de autorizar a primeira escrita real. Doze mudanças, todas no código do importador/preflight:

1. **Data/hora original** (`scripts/legacy-audit/lib/dates.mjs`, novo): `published_at` agora usa a data E hora reais extraídas de `.post-meta-info` (confirmado: as 1.635 páginas do lote têm `dd/mm/aaaa HH:MM` real, 539 horários distintos — não é um valor fixo/default), no fuso `America/Sao_Paulo` (`-03:00`). Antes o código usava `T12:00:00Z` fixo como se fosse o horário original. Quando só a data existir (sem hora), isso fica registrado explicitamente como `datePrecision: "date_only"` em `raw_metadata` — nunca escondido.
2. **Importação atômica** (migration `20261003100000_legacy_import_atomic_rpc.sql`): nova função `public.legacy_import_article(article jsonb, source jsonb)` que insere `articles` + `article_external_sources` na MESMA transação (RPC única) — elimina o risco anterior de artigo órfão se a conexão caísse entre os dois inserts separados. `security definer` com checagem explícita de staff para chamadas autenticadas.
3. **Mídia parcial** (`reconcileArticleImages` em `migrate.mjs`): ao reencontrar uma matéria já existente, o importador não pula mais ela inteira — confere `article_media`/`media_assets` existentes e só copia/vincula o que falta. Nunca duplica.
4. **Status `complete` mais rígido**: só marca `complete` quando `(imported+skippedExisting) === expected_articles` E `failed_articles=0` E `failed_images=0`. Qualquer imagem quebrada/pendente mantém o lote `incomplete`.
5. **`expected_*` persistidos**: `legacy_migration_batches.expected_articles/expected_image_references/expected_unique_images` agora são gravados a partir do preflight ANTES de importar (não depois).
6. **`source_hash` completo** (`lib/identity.mjs`): agora usa título, subtítulo, corpo COMPLETO normalizado (`bodyTextFull`, não mais só 500 caracteres), data original, categoria, autor/fonte e URLs de imagem — uma alteração no final de uma matéria longa agora é detectável.
7. **Quarentena editorial** (`lib/integrity.mjs`): `classificados` nunca é `eligible` automaticamente em nenhum lote (verdict `quarantined`, separado de `needs_review`) até revisão humana da categoria inteira. `agricultura` exige o mesmo antes do primeiro lote que a contiver. O lote 2015-2016 não tem nenhum item dessas categorias, então os números não mudaram — a regra existe para os lotes futuros.
8. **`docs/legacy-review-2015-2016.md`** (novo, gerado por `scripts/legacy-audit/report-2015-2016.mjs`): os 13 casos `needs_review` documentados individualmente (URL, títulos, datas, motivo, estrutura, trecho do corpo, sugestão) — nenhuma decisão automática tomada.
9. **`docs/legacy-sample-check-2015-2016.md`** (novo, mesmo script): amostra determinística de 30 matérias `eligible` (12 Geral, 6 Esporte, 6 Política, 6 Sociais, espalhadas por 2015-2016) para conferência humana antes da carga real.
10. **Corpo só editorial** (`lib/parse.mjs`): `h3.class-resumo` (o subtítulo, que já vai separado em `subtitle`) e `<script>` agora são removidos do HTML salvo em `body` — antes o subtítulo aparecia duplicado dentro do corpo.
11. `lib/pipeline.mjs` (novo): a lógica de dedupe/filtro/classificação foi extraída para um módulo único, usado tanto por `migrate.mjs` quanto por `report-2015-2016.mjs` — os relatórios humanos usam exatamente a mesma barreira que o importador, nunca uma cópia divergente.
12. **Dry-run final**: preflight refeito do zero (cache invalidada duas vezes por mudanças no parser) contra o site real. Números finais: **idênticos** aos da primeira rodada da Fase 35 — 1.622 eligible / 13 needs_review / 0 quarantined / 0 rejected. A barreira não foi afrouxada para bater esse número; a coincidência é porque nenhuma das correções afetava os mesmos 1.635 candidatos de forma diferente (ex.: quarentena não se aplica a este lote).

### Migrations

- `20261003100000_legacy_import_atomic_rpc.sql` — aplicada com sucesso via `supabase db push` (só schema/função, nenhum dado).

### Testes

- `migrate.mjs --mode=preflight` rodado do zero mais uma vez após todas as mudanças (regenerou o cache de 1.635 páginas — parser mudou). Resultado idêntico ao anterior.
- `report-2015-2016.mjs` rodado e conferido manualmente (13 casos + 30 amostras, ambos com conteúdo real e coerente).
- **Nenhum modo `import` foi executado, nem em dry-run** — por instrução explícita do usuário ("NÃO solicitar service-role", "PARE novamente antes de qualquer escrita real"). `runImport`/`importCandidate`/RPC existem no código mas não foram exercitados nesta fase.

### Erros

Nenhum. Mesma composição dos 13 `needs_review` da Fase 35 (ver `docs/legacy-review-2015-2016.md` para o detalhe caso a caso agora legível pelo GitHub).

### Pendências

1. Decisão do usuário sobre credencial de escrita — ainda não solicitada.
2. Revisão humana dos 13 casos em `docs/legacy-review-2015-2016.md` (a maioria: corpo genuinamente vazio, ou corpo real preso em `<h2>`/`<div>` de uma era de CMS mais antiga — "Polopoly").
3. Conferência humana da amostra em `docs/legacy-sample-check-2015-2016.md` antes da primeira carga real.
4. Quando a categoria `agricultura` entrar em algum lote futuro, fazer a amostragem/revisão exigida antes (hoje `REVIEWED_CATEGORIES` está vazio em `lib/integrity.mjs`).

### Próximo passo recomendado

Aguardar o usuário revisar `docs/legacy-review-2015-2016.md` e `docs/legacy-sample-check-2015-2016.md`, e decidir sobre a credencial de escrita. Só então rodar `node scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit`.

---

## Fase 35 — Motor de migração + preflight do lote 2015–2016 (ainda sem gravação)

**HEAD/commit:** `5f58ce4` (branch `feature/jornalir-core-foundation-20260917`)

### O que foi feito

- Migration `20261002100000_legacy_migration_batches.sql` aplicada: adiciona editorias `Agricultura` e `Classificados` (faltavam na auditoria da Fase 34) e cria a tabela `legacy_migration_batches` (staff-only, controla status/contadores de cada lote, retomável).
- Motor de migração reutilizável em `scripts/legacy-audit/migrate.mjs` + `lib/identity.mjs` (deduplicação por `provider+external_id` ou `provider+URL normalizada`, slug estável e determinístico) + `lib/batches.mjs` (plano oficial dos 6 lotes de 2 anos, mapeamento categoria legada → editoria).
- `lib/parse.mjs` ganhou extração de `bodyHtml` real (preserva `<p>`/`<strong>`/quebras) e sinalizadores estruturais (`entryHeaderCount`, `entryContentCount`, `coverSource`, `suspiciousBodyElements`) usados pela barreira de integridade.
- **Barreira de integridade editorial** (`scripts/legacy-audit/lib/integrity.mjs`, pedido explícito do usuário nesta fase): uma matéria só é `eligible` quando título, data, corpo e imagens vêm exclusivamente da estrutura própria da página (`.entry-header`/`.entry-content`/capa/galeria — nunca menu, publicidade, relacionadas, rodapé ou sidebar). Qualquer ambiguidade (estrutura duplicada, título/data divergentes entre listagem e detalhe, corpo vazio/curto, elemento de bloco não-editorial dentro do corpo, capa só via fallback `og:image`, imagem fora do host de mídia conhecido) vira `needs_review` — nunca é importada nem descartada.
  - **Achado real durante o ajuste da barreira**: a primeira versão testava padrões como "relacionad"/"publicidade" como substring solta no HTML serializado, o que gerava falso-positivo em texto comum (ex.: a palavra "relacionada" numa frase qualquer). Corrigido para checar a estrutura DOM real via seletores cheerio (`.ts-grid-box`, `.carousel-item`, `[class*='sidebar']` etc.), nunca substring em texto livre.
  - Um dos 13 itens finais de `needs_review` revelou um achado genuíno: uma matéria antiga (`nota_de_falecimento.416251`) tem corpo real, mas envolvido em tags `<h2>` em vez de `<p>` — e suas imagens vêm de `/polopoly_fs/...`, evidência de uma TERCEIRA era de CMS no histórico do site (além das duas já documentadas na Fase 34). Corretamente sinalizado para revisão manual, não importado às cegas.
- Preflight do lote 2015–2016 calculado a partir do inventário completo da Fase 34 (`scripts/legacy-audit/output/inventory.ndjson`) + busca real da página de cada uma das 1.635 matérias candidatas do intervalo (somente leitura — nenhuma escrita no Supabase).
- `docs/legacy-migration-status.json` criado/atualizado com o plano oficial dos 6 lotes e os números reais do preflight de 2015–2016.

### Migrations

- `20261002100000_legacy_migration_batches.sql` — aplicada com sucesso via `supabase db push`.

### Testes

- `migrate.mjs --mode=preflight` rodado de ponta a ponta contra o site real para o lote 2015–2016, três vezes (as duas primeiras revelaram bugs na barreira de integridade — cache desatualizado após mudar o parser, depois falso-positivo de substring — corrigidos e revalidados na terceira rodada).
- **Nenhum modo `import` foi executado nesta fase, nem em dry-run** — por instrução explícita do usuário ("não solicitar nem usar service-role nesta etapa", "PARE antes de qualquer escrita real"). O código de importação existe (`runImport`/`importCandidate` em `migrate.mjs`) mas não foi exercitado ainda.

### BLOQUEIO — pendência de credencial

A importação real (`--mode=import --commit`) vai precisar de `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ou uma sessão autenticada de staff) no ambiente quando for autorizada — nenhuma das duas foi solicitada ou usada nesta fase, por instrução explícita do usuário.

**Nenhuma matéria ou imagem foi gravada no Supabase.** Esta fase terminou no preflight.

### Quantidades (preflight do lote 2015–2016, números reais)

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (já deduplicadas por identidade) | 1.635 |
| Exceções de data (`31/12/1969`, fora de qualquer lote automático) | 7 |
| **Elegíveis** (passaram na barreira de integridade) | **1.622** |
| **Precisam de revisão manual** (`needs_review`) | **13** |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 1.506 |
| Sem imagem | 116 |
| Referências de imagem (capa + galeria, elegíveis) | 3.025 |
| URLs de imagem únicas (elegíveis) | 3.025 |
| Distribuição por editoria (elegíveis) | geral=1.114, esporte=231, política=228, sociais=49 |

Arquivos completos: `scripts/legacy-audit/output/batches/2015-2016/{preflight.json, date-exceptions.json, needs-review.json, rejected.json}` (não versionados — grandes/derivados, ver `.gitignore`).

### Erros

Nenhum erro de rede/parse na busca de detalhe (0 rejeitadas). 7 itens com data bugada (`31/12/1969 21:00`) continuam fora de qualquer lote automático. 13 itens em `needs_review` (ver lista completa em `needs-review.json`): 10 com corpo vazio real (inclusive um caso de corpo em `<h2>` de uma era de CMS ainda mais antiga, "Polopoly"), 1 com corpo de 2 caracteres (nota social tipo "QUADRO"), 2 outros com corpo vazio.

### Pendências

1. Usuário precisa decidir e fornecer a credencial de escrita (service role ou sessão staff) quando quiser autorizar a gravação real — não solicitada nesta fase.
2. Revisão manual dos 13 itens em `needs_review` antes de decidir o destino de cada um (importar manualmente corrigido, ou manter fora).
3. Após a gravação real (quando autorizada), rodar a reconciliação (item 16 da Fase 35) e só então marcar o lote como `complete` em `legacy_migration_batches`.
4. Não iniciar 2017–2018 antes da conferência completa do lote 2015–2016.

### Próximo passo recomendado

Aguardar decisão do usuário sobre credencial de escrita e sobre os 13 itens de `needs_review`. Só então rodar `node scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit` (grava só os 1.622 elegíveis), validar a reconciliação e atualizar este arquivo + `docs/legacy-migration-status.json` com os números finais.

---

## Fase 34 — Auditoria completa do site legado (somente leitura)

**Commit:** `c3323b0` — `feat: adiciona auditoria do site legado`

Ver `docs/legacy-audit.md` e `docs/legacy-audit.json` para o relatório completo (23.399 matérias declaradas pelo site, 23.393 encontradas na coleta de listagem, 100% das páginas de listagem percorridas, nenhuma gravação no Supabase).
