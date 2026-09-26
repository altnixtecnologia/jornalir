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

## Fase 34 — Auditoria completa do site legado (somente leitura)

**Commit:** `c3323b0` — `feat: adiciona auditoria do site legado`

Ver `docs/legacy-audit.md` e `docs/legacy-audit.json` para o relatório completo (23.399 matérias declaradas pelo site, 23.393 encontradas na coleta de listagem, 100% das páginas de listagem percorridas, nenhuma gravação no Supabase).
