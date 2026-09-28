# Revisão do ChatGPT — Fase 36 / lote 2017–2018

Revisado diretamente no GitHub sobre o HEAD `dd718cf`.

## Veredito do preflight

**PREFLIGHT APROVADO. AGRICULTURA PODE SER LIBERADA, MAS É OBRIGATÓRIO RODAR NOVAMENTE O PREFLIGHT DEPOIS DA LIBERAÇÃO ANTES DE IMPORTAR.**

Números atuais, ainda com Agricultura em quarentena:
- 2.511 candidatas;
- 2.498 eligible;
- 8 needs_review;
- 5 quarantined — todos agricultura;
- 0 rejected;
- 2.356 com imagem;
- 142 sem imagem;
- 4.087 referências de imagem;
- 4.087 URLs de imagem únicas.

Os 5 itens de Agricultura foram revisados individualmente em `docs/legacy-quarantined-2017-2018.md`. Todos têm conteúdo real e imagens coerentes; não há motivo editorial para manter a categoria inteira bloqueada.

## Atenção técnica importante sobre Agricultura

Hoje `assessArticleIntegrity()` retorna `quarantined` para Agricultura **antes** de executar todas as demais checagens estruturais.

Portanto os 5 itens não podem ser considerados definitivamente `eligible` apenas pelo relatório atual.

Próximo passo:
1. alterar `REVIEWED_CATEGORIES` para incluir `"agricultura"`;
2. manter `classificados` em quarentena;
3. rodar novamente o preflight 2017–2018;
4. somente depois usar o resultado real pós-liberação para autorizar a carga.

Se os 5 passarem pela barreira normal, o resultado esperado será aproximadamente:
- 2.503 eligible;
- 8 needs_review;
- 0 quarantined;
- 0 rejected;
- 2.361 com imagem;
- 142 sem imagem;
- 4.093 referências de imagem.

Não forçar esses números. Se algum item de Agricultura virar `needs_review`, respeitar a barreira e mantê-lo fora.

## Os 8 needs_review

Continuam todos FORA da carga automática.

Os casos com texto real em estrutura antiga podem ser recuperados depois em revisão manual específica. Os itens com corpo vazio, inclusive `sociais/teste.420173`, não devem entrar automaticamente.

Nenhum desses 8 deve ser liberado nesta fase.

## Ajuste obrigatório do validador antes do segundo lote

O atual `scripts/legacy-audit/batch-final-validate.mjs` foi suficiente para 2015–2016 porque aquele era o único conteúdo legado no banco. Ele consulta todo `origin=legacy_site`.

Antes de validar 2017–2018, generalizar o validador para ser **escopado por lote** (`--batch=2017-2018`) e comparar apenas as identidades esperadas daquele lote.

A validação de 2017–2018 deve conferir o lote isoladamente, sem misturar as 1.622 matérias já migradas de 2015–2016.

Manter também uma checagem global de duplicidade, mas o veredito do lote precisa ser batch-scoped.

## Autorização condicional para a carga real 2017–2018

Depois de:
1. liberar Agricultura;
2. rerodar o preflight;
3. confirmar que não houve nova anomalia;
4. deixar o validador final escopado por lote;

fica **AUTORIZADA a carga real de 2017–2018** com o conjunto `eligible` resultante.

Comando:

`node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2017-2018 --mode=import --commit --rps=4`

Se o sandbox bloquear, pedir ao usuário somente para executar esse comando exato manualmente.

## Validação final obrigatória

Após a carga:
- artigos do lote == eligible pós-liberação;
- sources do lote == eligible pós-liberação;
- referências article_media do lote == esperado do novo preflight;
- 0 falhas de artigos;
- 0 falhas de imagens;
- nenhuma duplicata;
- capa/galeria/sort_order corretos;
- Storage existente;
- nenhuma placement;
- os 8 needs_review continuam fora;
- nenhum item de outro lote alterado;
- `legacy_migration_batches.status = complete` somente se o lote fechar exatamente.

Atualizar/criar:
- `docs/AI_HANDOFF.md`;
- `docs/legacy-migration-status.json`;
- `docs/legacy-batch-2017-2018-final.md`;
- relatório do novo preflight pós-liberação de Agricultura.

Commit/push e PARAR antes de 2019–2020.

## Observações mantidas

- `classificados` continua em quarentena automática;
- localidade do legado continua `Geral`;
- a ausência histórica da editoria Polícia em 2015–2018 está documentada e não é tratada como erro;
- o bloco público “Mais destaques” será automatizado futuramente por `published_at`, não por `created_at`.


## Decisão do usuário sobre falhas pontuais de imagem

Durante a carga 2017–2018, o usuário observou que aparentemente uma ou poucas imagens podem ter falhado.

Decisão:
- falha **pontual e isolada** de imagem não deve ser tratada como motivo para abandonar o lote;
- registrar cada caso com matéria, URL de origem e motivo da falha;
- manter a matéria migrada se o conteúdo editorial estiver íntegro;
- essas imagens podem ser baixadas/inseridas manualmente depois;
- **não esconder nem descartar** a pendência;
- se a quantidade deixar de ser pontual e virar dezenas/centenas, PARAR e investigar a causa antes de seguir.

Na validação final, reportar claramente quantas imagens ficaram pendentes e quais matérias foram afetadas. Não forçar números nem marcar como sucesso silenciosamente.


## Regra global de ordenação de matérias

Decisão do usuário:

- em todas as listagens públicas de matérias, a ordem padrão deve ser **decrescente por publicação**;
- matérias mais novas sempre aparecem primeiro;
- matérias antigas vão ficando para o fim;
- usar **`published_at DESC`** como critério principal, nunca `created_at`;
- em empate de `published_at`, usar um desempate estável (por exemplo `id DESC`);
- isso vale para home, editorias, localidades, arquivos/listagens e blocos automáticos como “Mais destaques”;
- a migração de conteúdo antigo não pode fazer matérias antigas subirem só porque foram inseridas agora no banco.

Não alterar a data histórica da matéria para obter a ordenação; preservar `published_at` original.


## Correção prioritária do portal — listagens estão artificialmente limitadas

Achado confirmado no código atual do portal:

- `/busca` chama `listPublicArticles({ limit: 200 })`;
- `/noticias` chama `listPublicArticles({ limit: 60 })`;
- `/editoria/[slug]` chama `listPublicArticles({ ..., limit: 40 })`.

Isso explica por que o usuário vê apenas cerca de 200 matérias no site mesmo com milhares já migradas. **Não é perda de dados da migração; é limite de interface/query.**

### Correção obrigatória

Implementar paginação real, sem carregar milhares de matérias de uma vez:

1. `/noticias`
   - paginação server-side;
   - ordem global `published_at DESC` + desempate estável;
   - mostrar total real de matérias publicadas;
   - todas as matérias devem ser alcançáveis pelas páginas.

2. `/editoria/[slug]`
   - paginação server-side por editoria;
   - `published_at DESC`;
   - mostrar total real daquela editoria;
   - não limitar a 40 no total.

3. `/busca`
   - remover o teto global de 200;
   - busca deve alcançar todo o acervo publicado;
   - preferir busca/query paginada no Supabase em vez de carregar todo o acervo no navegador;
   - resultados em `published_at DESC`.

4. `publicContentService`
   - criar API de listagem paginada com `page/pageSize` ou `offset/limit` e `count: exact`;
   - manter compatibilidade com usos pequenos da home/“Leia também”;
   - ao buscar capas para lotes maiores, evitar `.in()` gigante; fazer chunks/paginação se necessário.

5. Não alterar `published_at` histórico e não usar `created_at` para ordenação.

6. Não mexer na migração já concluída para resolver isso; a correção é do portal.

### Critério de aceite

Com os lotes 2015–2018 já migrados, o portal deve permitir navegar por **todo o acervo de 4.125 matérias**, sem exibir apenas 40/60/200 por limite fixo. As mais novas aparecem primeiro e as antigas ficam nas páginas seguintes.

Implementar isso como etapa de portal/UI separada da migração e registrar no handoff.


## UX da paginação — decisão do usuário

Aplicar em desktop e mobile nas listagens paginadas do portal.

### Quantidade por página
- padrão: **24 matérias por página**;
- opções: **24 / 48 / 96**;
- usar controle visual moderno/compacto, não o `<select>` quadrado padrão;
- posicionar no cabeçalho da listagem, no lado oposto ao título/contador quando houver espaço;
- no mobile, adaptar para largura menor sem perder legibilidade.

### Navegação por páginas
- exibir paginação numerada: **1, 2, 3, ...**;
- incluir controles anterior/próxima;
- quando houver muitas páginas, usar reticências em vez de mostrar todos os números;
- manter números suficientes ao redor da página atual para o usuário se localizar;
- no mobile, pode ser mais compacto, mas deve continuar mostrando páginas numeradas, não apenas anterior/próxima.

### Estado/URL
- refletir `page` e `pageSize` na URL/query string para permitir voltar/avançar do navegador e compartilhar a página;
- ao mudar 24/48/96, voltar para a página 1 para evitar página inválida;
- preservar filtros/editoria/busca ao trocar de página.

### Ordenação
- sempre `published_at DESC` + desempate estável;
- nunca usar `created_at` para empurrar conteúdo histórico para o topo.


## Revisão da Fase 39 — paginação do portal

Revisado diretamente no GitHub sobre o HEAD `d7de753`.

A base da correção está boa: paginação real no Supabase, `count: exact`, `.range()`, ordem `published_at DESC` + `id DESC`, 24/48/96, páginas numeradas e tratamento de página além do fim.

**Ainda faltam 2 ajustes antes de encerrar a Fase 39:**

### 1. Posição do seletor 24/48/96 em Notícias/Editorias

O usuário pediu o seletor **no cabeçalho da listagem, no lado oposto ao título/contador**, tanto desktop quanto mobile.

Hoje, em `/noticias` e `/editoria/[slug]`, o seletor está dentro de `PublicPagination`, depois da grade, portanto aparece no rodapé da listagem.

Corrigir:
- manter paginação numerada no rodapé;
- mover/expor o seletor 24/48/96 também no cabeçalho da listagem, alinhado ao lado oposto ao título/contador no desktop;
- no mobile, quebrar/empilhar de forma compacta e bonita;
- evitar duplicar controles se não for necessário: o seletor pode ficar no topo e a navegação de páginas no rodapé.

### 2. Busca: voltar/avançar do navegador não está realmente sincronizado

Em `/busca`, o estado `queryInput/debouncedQuery/page/pageSize` é inicializado a partir de `useSearchParams()`, mas não existe efeito que sincronize o estado quando a URL muda depois do mount.

Além disso, a atualização usa `router.replace()`, então mudanças de página/tamanho não criam histórico navegável.

Corrigir para cumprir o requisito já registrado:
- paginação e troca 24/48/96 devem usar navegação que permita Back/Forward (ex.: `router.push`);
- mudanças de termo digitado podem continuar usando `replace` para não poluir o histórico a cada tecla, se preferível;
- adicionar sincronização URL -> estado para mudanças reais vindas de Back/Forward;
- evitar loop entre URL e estado;
- preservar `q`, `page` e `pageSize`.

### Validação mínima

Confirmar:
- editoria/notícias: seletor visível no topo + paginação numerada embaixo;
- mobile responsivo;
- busca: ir para página 2, voltar no navegador e retornar corretamente à página anterior/estado anterior;
- trocar 24 -> 48 cria estado navegável e Back restaura 24;
- compartilhar/recarregar URL com `q/page/pageSize` restaura exatamente a tela.

Depois atualizar `docs/AI_HANDOFF.md`, commit/push e parar para nova conferência.


## Revisão da Fase 39C — APROVADA / encerrada

Revisado diretamente no GitHub sobre o HEAD `6b5af37`.

Os 2 ajustes pedidos foram implementados corretamente:

1. `24/48/96` agora fica no cabeçalho de `/noticias` e `/editoria/[slug]`, separado da paginação numerada do rodapé.
2. `/busca` usa a URL como fonte de verdade para `q/page/pageSize`; paginação e troca de tamanho usam `router.push`, enquanto a digitação usa `replace`.

A lógica de Back/Forward está consistente por revisão de código. A checagem manual no navegador continua recomendada, mas **não é bloqueio para seguir com a migração**.

Observação menor para hardening futuro: uma URL manual de busca com `page` muito acima da última página é corrigida internamente pelo serviço, mas a UI da busca ainda usa o `page` vindo da URL em vez de adotar explicitamente `result.page`. Não bloqueia o uso normal, mas pode ser normalizado numa manutenção futura.

### Pendência documental pequena

Em `docs/legacy-migration-status.json`, a nota global `quarentenaEditorial` ainda contém texto antigo dizendo que `REVIEWED_CATEGORIES` está vazio. Isso ficou desatualizado após a Fase 37, quando `agricultura` foi liberada. Corrigir essa nota na próxima atualização do status para não haver contradição com o estado real do código.

---

## Próxima etapa — AUTORIZADO SOMENTE PREFLIGHT/AUDITORIA 2019–2020

Ainda **não importar** 2019–2020.

Executar o preflight completo do lote `2019-2020` com a mesma barreira de integridade e gerar os relatórios antes de qualquer escrita real.

Obrigatório levantar:
- candidatas;
- eligible;
- needs_review;
- quarantined;
- rejected;
- com/sem imagem;
- referências de imagem;
- URLs únicas;
- distribuição por editoria;
- exceções de data.

Regras:
- `agricultura` já está revisada/liberada e passa pela barreira normal;
- `classificados` continua em quarentena automática e NÃO pode virar eligible;
- `policia` deve aparecer neste lote a partir de 2020 segundo o inventário; confirmar a primeira ocorrência e incluir uma amostra legível da categoria para conferir que o mapeamento `policia -> Polícia` está correto;
- manter localidade do legado = `Geral`;
- não inferir cidades;
- não liberar nenhum `needs_review` automaticamente;
- não tocar em 2021–2022;
- nenhuma matéria/imagem real importada nesta etapa.

Gerar/atualizar:
- `docs/AI_HANDOFF.md`;
- `docs/legacy-migration-status.json` (incluindo corrigir a nota antiga de Agricultura);
- `docs/legacy-preflight-2019-2020.md`;
- `docs/legacy-review-2019-2020.md` se houver casos;
- `docs/legacy-quarantined-2019-2020.md` se houver quarentena;
- amostra legível de Polícia e das demais categorias novas/relevantes do lote.

Commit/push e PARAR para nova conferência antes da carga real.


## Revisão da Fase 40 — preflight 2019–2020 APROVADO

Revisado diretamente no GitHub sobre o HEAD `9bca751`.

O preflight está coerente e não houve mudança no motor de migração nesta fase — apenas relatórios/status. Os números fecham:

- 5.100 candidatas;
- 5.088 eligible;
- 12 needs_review;
- 0 quarantined;
- 0 rejected;
- 5.039 com imagem / 49 sem imagem;
- 7.082 referências de imagem;
- 7.082 URLs únicas.

Distribuição elegível:
- geral=3.450;
- saude=885;
- policia=298;
- politica=236;
- esporte=107;
- sociais=45;
- agricultura=39;
- colunistas=28.

A primeira entrada real de `policia` foi conferida e o mapeamento `policia -> Polícia` está correto. `saude` também aparece em volume pela primeira vez e usa a editoria já existente. `agricultura` segue liberada normalmente. `classificados` não apareceu neste lote e continua em quarentena automática para lotes futuros.

Os 12 `needs_review` permanecem FORA da carga automática. Não liberar nenhum deles agora.

## AUTORIZADA A CARGA REAL 2019–2020

Como o motor, a retomada idempotente, a mídia e o validador batch-scoped já foram exercitados e validados nos dois lotes anteriores, não é necessário novo canário.

Executar:

`node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2019-2020 --mode=import --commit --rps=4`

Se o sandbox bloquear, pedir ao usuário somente para executar esse comando exato manualmente.

### Regra para falhas de imagem

- uma ou poucas falhas transitórias podem ser reconciliadas por retry, como no lote anterior;
- registrar matéria/URL/motivo;
- se começar a ocorrer em volume (dezenas/centenas), PARAR e investigar antes de continuar;
- nunca marcar lote como complete com pendências silenciosas.

### Validação final obrigatória

Depois da carga, rodar:

`node --env-file=".env.local" scripts/legacy-audit/batch-final-validate.mjs --batch=2019-2020`

Confirmar no lote isolado:
- 5.088 articles;
- 5.088 article_external_sources;
- 7.082 media_assets/referências reconciliadas conforme o preflight;
- 7.082 article_media esperados;
- 0 duplicatas;
- 0 placements;
- 12 needs_review continuam fora;
- exceções de data continuam fora;
- nenhuma matéria de 2015–2018 alterada;
- checagem global sem duplicatas entre os 3 lotes;
- `legacy_migration_batches.status = complete` apenas se tudo fechar.

Se houver falha pontual de imagem, fazer retry do mesmo comando e repetir a validação.

Gerar/atualizar:
- `docs/legacy-batch-2019-2020-final.md`;
- `docs/AI_HANDOFF.md`;
- `docs/legacy-migration-status.json`.

Commit/push e PARAR antes de 2021–2022.


## Auditoria obrigatória antes de 2021–2022 — possíveis matérias duplicadas

O usuário identificou visualmente uma matéria duplicada no portal:
`HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO` (26/09/2020, editoria Sociais), aparecendo duas vezes com a mesma foto/título/data.

Antes de iniciar 2021–2022, executar uma auditoria **somente leitura** sobre os 9.213 artigos já migrados (2015–2020). Não apagar, mesclar ou alterar nada ainda.

### Verificar no banco

1. Grupos com mesmo `title` normalizado + mesmo `published_at`.
2. Grupos com mesmo `body` normalizado/hash.
3. Grupos com mesma capa/`origin_source_url`.
4. Para cada grupo suspeito, comparar:
   - `article.id`;
   - slug;
   - `article_external_sources.external_id`;
   - URL de origem;
   - categoria/editoria;
   - `published_at`;
   - hash/corpo;
   - mídia de capa.
5. Separar em:
   - duplicata real provável (mesmo conteúdo, IDs externos diferentes);
   - registros diferentes legítimos apesar de título/data iguais;
   - duplicata impossível por identidade (mesmo external_id/URL — seria bug grave).
6. Conferir especificamente a matéria:
   `HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO`.
7. Comparar o achado com a auditoria antiga que já registrava 48 candidatos por título+data — mas não assumir que todos são duplicatas.

### Entregáveis

Criar:
- `docs/legacy-duplicate-audit-2015-2020.md`;
- se útil, um JSON resumido com os grupos encontrados;
- atualizar `docs/AI_HANDOFF.md`.

O relatório deve trazer:
- quantidade total de grupos suspeitos;
- quantidade de artigos envolvidos;
- quantos são duplicatas reais prováveis;
- quantos são legítimos/não conclusivos;
- se existe qualquer duplicata pelo MESMO `external_id` ou mesma URL de origem;
- detalhes completos do caso citado pelo usuário.

**Não corrigir/apagar nesta etapa.** Apenas auditoria e classificação. Commit/push e parar para revisão.


## URGENTE — limpar duplicatas confirmadas antes de 2021–2022

O usuário quer encerrar isso agora. A auditoria `docs/legacy-duplicate-audit-2015-2020.md` foi revisada.

### Decisão

Corrigir **somente os 54 grupos classificados como "Duplicata real provável"** (115 artigos, corpo normalizado idêntico).

**NÃO tocar**:
- nos 11 grupos "Precisa inspeção manual";
- nos 3 grupos legítimos;
- em qualquer artigo fora desses 54 grupos.

### Como corrigir

Não deletar nem mesclar registros.

Para cada grupo confirmado:
- manter 1 artigo como `published`;
- marcar os demais como `archived`;
- preencher `archived_at = now()`;
- preservar integralmente `article_external_sources`, mídias, URLs de origem, external_id e demais rastros.

### Regra determinística para escolher a cópia canônica

Aplicar nesta ordem:

1. Se uma cópia não tem capa e outra tem, **manter a que tem capa**.
2. Se as editorias diferem e uma é `geral` enquanto a outra é uma editoria específica, **manter a específica** (ex.: Esporte/Política).
3. Caso contrário, **manter a publicação mais recente por `published_at`**.
4. Se houver empate exato de `published_at`, manter a de maior `external_id` numérico.
5. Nunca alterar título/corpo/data/editoria da canônica nesta etapa.

Essa regra resolve também o caso reportado pelo usuário:
`HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO` — manter a ocorrência mais recente e arquivar a outra.

### Segurança

Antes de gravar:
- gerar dry-run com lista explícita `keep_external_id` / `archive_external_ids`;
- confirmar que a quantidade a arquivar é exatamente `115 - 54 = 61` artigos;
- confirmar que nenhum ID dos 11 grupos manuais ou 3 legítimos entrou na lista.

Depois, executar a atualização real de status somente nesses IDs.

### Validação depois da limpeza

Confirmar:
- 61 artigos arquivados;
- 54 grupos confirmados passam a ter somente 1 artigo público;
- 11 grupos manuais continuam intactos;
- 3 grupos legítimos continuam intactos;
- 0 deletes;
- 0 alterações em `article_external_sources`;
- 0 alterações/remoções de mídia;
- total físico em `articles` continua 9.213;
- total público diminui em 61;
- o caso `420122/420123` aparece apenas uma vez publicamente.

Criar `docs/legacy-duplicate-cleanup-2015-2020.md`, atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`.

### Progresso para os próximos lotes — fazer agora, antes de 2021–2022

Depois da limpeza, adicionar progresso ao importador sem alterar a lógica de importação:
- log a cada 25 ou 50 matérias;
- mostrar `processadas/total`, %, imagens reconciliadas/esperadas, falhas, tempo decorrido e ETA aproximada;
- atualizar `legacy_migration_batches.metadata` periodicamente com checkpoint/progresso;
- não gerar escrita por artigo além do que já existe; checkpoint pode ser periódico;
- preservar retomada/idempotência.

Não iniciar 2021–2022 ainda. Commit/push e PARAR para conferência.


## Revisão da Fase 43 — limpeza aprovada; progresso precisa de hardening antes de 2021–2022

Revisado diretamente no GitHub sobre o HEAD `8965781`.

### Limpeza de duplicatas — APROVADA

A limpeza dos 54 grupos confirmados está correta:
- 61 artigos arquivados, 0 deletes;
- 54 canônicos permanecem publicados;
- total físico permanece 9.213;
- total público caiu para 9.152;
- 11 grupos manuais e 3 legítimos permaneceram intactos;
- caso 420122/420123 resolvido conforme regra;
- proveniência e mídia preservadas.

Nenhuma reversão necessária.

### Importador com progresso — ainda precisa 3 correções de segurança

O incidente com `--limit=120 --commit` em um lote já `complete` mostrou um risco real. Antes de iniciar 2021–2022, corrigir:

1. **Proteger lote já concluído contra execução parcial**
   - se `legacy_migration_batches.status = complete` e houver `--limit` finito com `--commit`, abortar ANTES de mudar status para `running`;
   - mensagem clara dizendo que um lote concluído não pode ser reaberto parcialmente;
   - full rerun sem `--limit` pode continuar permitido para reconciliação/idempotência.

2. **Separar tentativas de sucessos no progresso**
   - hoje `processed` só incrementa quando `importCandidate` não lança erro;
   - isso torna `--limit`, porcentagem e ETA incorretos quando existe falha de artigo;
   - criar `attempted` que incrementa para CADA candidata tentada, sucesso ou erro;
   - usar `attempted` para limite/progresso/ETA;
   - manter `imported/skippedExisting/failedArticles` como contadores de resultado.

3. **Não apagar metadata anterior durante checkpoint**
   - o update periódico atual grava `metadata: { progress: ... }`, substituindo temporariamente o JSON anterior;
   - ler/preservar metadata existente e fazer merge ao atualizar `progress`;
   - a reconciliação final pode gravar o resumo final normalmente, mas não deve haver janela em que metadata histórica seja descartada só por causa do progresso.

### Teste obrigatório

Sem tocar em lote concluído real:
- testar a lógica de progresso em dry-run ou com teste unitário/helper;
- testar que `--commit --limit=N` contra lote `complete` é recusado antes de qualquer UPDATE;
- testar cenário simulado com 1 falha para confirmar que `attempted` chega ao limite e o ETA/progresso não trava;
- typecheck/build se aplicável.

Commit/push e PARAR para nova conferência. **Ainda não iniciar o preflight 2021–2022.**


## Regra editorial revisada para duplicatas — decisão do usuário

Não considerar matérias duplicadas apenas porque têm o mesmo título ao longo dos anos.

Regra para auditorias futuras:
- mesmo título em anos/datas diferentes = **não é duplicata por si só**;
- mesmo título + mesma data = **forte candidato**, mas ainda não arquivar automaticamente apenas por isso;
- para classificar como duplicata real, exigir confirmação adicional por conteúdo, preferencialmente:
  - corpo normalizado idêntico/hash idêntico; ou
  - corpo praticamente idêntico após inspeção;
  - e, quando útil, mesma/semelhante mídia, fonte e proximidade de horário;
- se o conteúdo divergir de forma relevante, manter como matérias distintas mesmo com mesmo título e mesma data;
- nunca usar apenas título como chave de deduplicação.

A limpeza já executada em 2015–2020 permanece válida: os 54 grupos corrigidos foram os grupos classificados como duplicata real provável com **corpo normalizado idêntico**, não apenas título/data iguais. Os 11 grupos de corpo apenas parecido e os 3 grupos legítimos não foram tocados.


## Autorização operacional — concluir todos os lotes restantes antes do novo Preview

Decisão do usuário: concluir a migração histórica inteira primeiro e só depois gerar o novo Preview do portal.

### Ordem obrigatória

1. Finalizar e testar o hardening do progresso já pedido nesta revisão.
2. Processar, em sequência:
   - 2021-2022
   - 2023-2024
   - 2025-2026
3. Só após os 3 lotes restantes estarem concluídos/validados, gerar novo Preview do `apps/site`.

### Para cada lote restante

Executar o mesmo pipeline já validado:
- preflight;
- barreira de integridade;
- relatório de `needs_review` / `quarantined` / `rejected`;
- import real somente dos elegíveis;
- retry das falhas pontuais de mídia;
- validação batch-scoped;
- checagem global de duplicidade por identidade;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`.

Não precisa parar entre lotes se todos os critérios abaixo estiverem verdes.

### Parar imediatamente e pedir revisão somente se ocorrer

- dezenas/centenas de falhas de imagem ou padrão de erro sistêmico;
- falha de artigo não resolvida;
- divergência entre esperado e importado;
- duplicidade por `external_id` ou `source_url`;
- nova categoria não mapeada / categoria que exija decisão editorial;
- qualquer vazamento de `needs_review`, `quarantined` ou exceção de data para a carga;
- risco de perda/alteração de dados já migrados;
- lote não conseguir fechar como `complete`.

Falhas isoladas/transitórias de imagem podem ser retentadas e reconciliadas como nos lotes anteriores.

### Regras editoriais mantidas

- `classificados` continua em quarentena editorial: não importar automaticamente enquanto não houver revisão específica.
- duplicatas de conteúdo: não usar apenas título; mesmo título em datas diferentes não é duplicata por si só. Mesmo título+mesma data é apenas candidato; confirmação exige conteúdo idêntico/quase idêntico.
- nenhuma limpeza automática de novos suspeitos durante a migração; apenas registrar para auditoria posterior.
- matérias `needs_review` ficam fora da carga automática.

### Fechamento final

Ao terminar 2025-2026:
- rodar validação global final;
- informar total físico de artigos, total `published`, total `archived`, total de mídias;
- listar quantidade total remanescente em `needs_review`, `quarantined` e exceções de data;
- confirmar 0 duplicatas por identidade;
- gerar relatório final da migração;
- commit/push;
- então gerar um NOVO Preview do `apps/site` contra o banco completo, com paginação 24/48/96.

Não fazer deploy de Production/domínio oficial. Apenas Preview.


## CORREÇÃO DA AUTORIZAÇÃO OPERACIONAL — seguir o plano lote a lote

Correção explícita do usuário: **NÃO executar todos os lotes restantes em sequência automaticamente.**

Manter o fluxo original, com uma etapa por vez e conferência entre elas.

### Próximo passo autorizado agora

1. Concluir o hardening do progresso já solicitado.
2. Depois executar **somente o preflight/auditoria do lote 2021-2022**.
3. Gerar os relatórios, atualizar handoff/status, commit/push e **PARAR para conferência**.

### Não autorizado neste momento

- Não executar a carga real de 2021-2022 sem nova aprovação.
- Não iniciar 2023-2024.
- Não iniciar 2025-2026.
- Não gerar o Preview final ainda.
- Não fazer deploy de Production.

Após cada etapa/lote, o ChatGPT confere o GitHub e libera explicitamente o próximo passo, mantendo o plano seguro usado até aqui.


## Liberação explícita do próximo passo — 2021-2022

Esclarecimento do usuário: a expressão "terminar tudo de uma vez" significava apenas concluir o projeto sem enrolação, **não** executar todos os lotes automaticamente. O fluxo correto continua sendo o original: **um lote por vez, com conferência entre as etapas**.

O hardening da Fase 43B foi conferido no GitHub sobre o HEAD atual e está aprovado:
- lote `complete` protegido contra `--commit --limit=N`;
- progresso usa `attempted` para toda tentativa;
- metadata anterior é preservada durante checkpoints.

### AUTORIZADO AGORA

Executar **somente o PREFLIGHT/AUDITORIA do lote 2021-2022**.

Fazer:
- coletar/classificar o lote com a mesma barreira de integridade;
- gerar números de candidatas, eligible, needs_review, quarantined, rejected;
- contar imagens/referências/URLs únicas;
- distribuição por editoria;
- identificar qualquer categoria nova ou primeira aparição relevante;
- gerar relatórios equivalentes aos lotes anteriores;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- **PARAR para nova conferência**.

### NÃO AUTORIZADO AINDA

- não executar import real de 2021-2022;
- não iniciar 2023-2024;
- não iniciar 2025-2026;
- não gerar novo Preview ainda;
- não fazer Production.

Se o preflight encontrar categoria nova/não revisada, volume anormal de `needs_review`, inconsistência de contagem ou outro achado estrutural, destacar claramente no handoff.


## Otimização obrigatória — evitar retrabalho no 2021-2022

Preocupação explícita do usuário: etapas longas não devem ser refeitas sem necessidade.

Para o preflight 2021-2022:

1. **NÃO reexecutar nenhum lote já concluído** (2015-2016, 2017-2018, 2019-2020).
2. **NÃO apagar/inutilizar cache ou checkpoint existente** sem motivo técnico comprovado.
3. Reutilizar integralmente:
   - `output/inventory.ndjson` da auditoria global;
   - `output/batches/2021-2022/details.ndjson`, se já existir parcial;
   - `checkpoint.json`, se já existir.
4. Antes de qualquer coleta longa, fazer uma checagem rápida e informar:
   - quantas candidatas 2021-2022 existem no inventário;
   - quantos detalhes já estão em cache;
   - quantos ainda precisariam ser buscados.
5. Só buscar do site legado os detalhes **faltantes**.
6. O cache gerado no preflight deve ser reutilizado depois na importação real do mesmo lote; não fazer nova coleta das mesmas páginas.
7. Se a execução for interrompida, retomar do cache/checkpoint, nunca do zero.
8. Não invalidar cache por mudanças recentes de progresso/deduplicação: essas mudanças não alteraram o parser de conteúdo legado.

A próxima etapa continua sendo somente o preflight 2021-2022, mas deve ser feita de forma incremental e sem retrabalho.


## Revisão do preflight 2021-2022 — números aprovados, 1 checagem rápida antes da carga real

Revisado no GitHub sobre o HEAD atual `f701266`.

### Preflight aprovado nos números

- candidatas: 4.488
- eligible: 4.475
- needs_review: 13
- quarantined: 0
- rejected: 0
- com imagem: 4.469
- sem imagem: 6
- referências de imagem: 6.889
- nenhuma categoria nova
- classificados ausente
- agricultura já liberada e normal

### Achado pontual na amostra que precisa ser verificado antes de importar

Na amostra `docs/legacy-sample-check-2021-2022.md`, a matéria:

`CAMPEONATO PRAIANO DE BEACH SOCCER 2022 COMEÇA EM TORRES NO PRÓXIMO SÁBADO`
(external_id 418316)

foi classificada como `eligible`, mas o final de `bodyTextFull` contém texto com aparência de atributo HTML vazado:

`style="width: 363.273px; height: 646.933px;" data-filename="retriever">Divulgação/`

Isso pode indicar HTML malformado da origem sendo incorporado como texto editorial.

### Fazer AGORA — sem retrabalho e sem refetch

NÃO repetir coleta, NÃO invalidar cache e NÃO refazer o preflight de rede.

Usar somente o cache já existente em:
`output/batches/2021-2022/details.ndjson`

Fazer uma varredura local rápida sobre os **4.475 eligible** procurando em `bodyTextFull` fragmentos com aparência de atributos/tags HTML vazados como texto, por exemplo:
- `style="`
- `data-...="`
- `class="`
- `src="`
- `href="`
- tags literais inesperadas como `<img`, `<div`, `<span`

Evitar falso positivo: procurar esses padrões em `bodyTextFull` (texto extraído), NÃO em `bodyHtml`.

### Se encontrar casos

- listar quantidade + external_id + título;
- classificar esses casos como `needs_review` (não corrigir conteúdo automaticamente nesta etapa);
- adicionar uma regra conservadora na barreira de integridade para capturar esse tipo de vazamento textual;
- reclassificar/regenerar os relatórios **usando exclusivamente o cache atual**, sem nova coleta do site;
- atualizar os números finais do preflight.

### Se não houver outros casos

Mesmo assim, o external_id 418316 deve sair de `eligible` e virar `needs_review`, pois o vazamento está comprovado na amostra.

Depois: commit/push e PARAR para conferência. Ainda não executar a carga real 2021-2022.


## Revisão da Fase 44B — achado válido; evitar deixar 160 matérias de fora sem apuração

Revisado no GitHub sobre o HEAD `a786cec`.

A nova barreira está correta e conservadora: os 160 casos realmente contêm texto com aparência de atributo HTML vazado. Porém, **160 casos é volume alto demais para simplesmente aceitar como revisão manual sem entender o padrão**, porque o relatório indica que muitos parecem ser resíduos mecânicos de marcação de imagem do CMS antigo, não conteúdo editorial ambíguo.

### Observação da revisão

Nos 160 casos:
- 99 dispararam por `data-filename="retriever"`;
- 42 por `style="width: 50%; ..."`;
- os demais são principalmente variantes de `style="width: ...; height: ...;"`.

Isso sugere fortemente um padrão sistemático de markup de imagem malformado da origem.

### Próximo passo autorizado — SOMENTE análise local, sem refetch e sem import

Usar exclusivamente o cache atual de 2021-2022. Não buscar nenhuma página novamente.

Para os 160 casos, gerar uma análise curta contendo:
1. assinatura/padrão do vazamento e quantidade por padrão;
2. posição do vazamento no `bodyTextFull` (final do corpo vs. meio);
3. 100–200 caracteres de contexto antes/depois do vazamento;
4. se o mesmo fragmento aparece como texto literal também em `bodyHtml`;
5. quantos casos parecem claramente resíduo de imagem/atributo do CMS e quantos são realmente ambíguos.

### Se houver padrão mecânico seguro

Se ficar comprovado que um subconjunto é somente resíduo de markup de imagem, propor/implementar uma sanitização **estritamente específica** para esse padrão, aplicada ao conteúdo que será efetivamente importado (`bodyHtml` e texto derivado), sem remover texto editorial legítimo.

Depois:
- reclassificar pelo cache;
- regenerar relatórios pelo cache;
- mostrar quantos voltaram a `eligible` e quantos continuam `needs_review`.

### Checagem preventiva barata

Se os caches locais dos lotes 2015-2016, 2017-2018 e 2019-2020 ainda existirem, fazer a MESMA varredura somente leitura neles, sem refetch e sem alterar nada, apenas para saber se esse padrão já entrou em conteúdo antigo. Se não houver cache local, não buscar novamente.

Commit/push e PARAR. Ainda não executar a carga real 2021-2022.


## Revisão da Fase 44C — sanitização aprovada; corrigir 203 registros de 2019-2020 antes da carga 2021-2022

Revisado no GitHub sobre o HEAD `b4c1540`.

### Fase 44C aprovada

A análise sustenta que os 160 casos de 2021-2022 são resíduo mecânico de markup de imagem quebrado no CMS legado:
- padrão restrito a atributos de imagem + `&gt;`;
- 160/160 cobertos;
- 0 falso-positivo nos demais artigos conferidos;
- sanitização aplicada antes de derivar `bodyHtml/bodyTextFull`;
- preflight 2021-2022 voltou corretamente para 4.475 eligible / 13 needs_review / 6.889 referências de imagem;
- nenhum refetch foi necessário.

A sanitização em `lib/sanitize.mjs` fica aprovada para os lotes futuros.

### Pendência descoberta: 203 registros já importados em 2019-2020

Antes de importar 2021-2022, corrigir somente esses 203 registros já existentes, sem refetch e sem reimportar o lote inteiro.

### Procedimento obrigatório — correção pontual, reversível e sem sobrescrever edição posterior

Criar um script específico, preferencialmente `scripts/legacy-audit/fix-imported-html-residue.mjs`, que use o cache local de 2019-2020 e a mesma função `sanitizeBodyHtml`.

Primeiro executar em **dry-run** e montar plano explícito.

Para cada um dos 203 external_ids:
1. localizar a matéria por `article_external_sources.provider + external_id`;
2. carregar `articles.body`, status e `article_external_sources.source_hash`;
3. calcular do cache:
   - corpo antigo esperado (não sanitizado);
   - corpo sanitizado;
   - novo `source_hash` usando o mesmo `sourceHash()` atual;
4. **só atualizar automaticamente se o body atual no banco for exatamente o body antigo esperado do cache**. Isso evita sobrescrever qualquer edição manual feita depois da migração;
5. se houver qualquer divergência no body atual, NÃO tocar o registro e listar como `manual_conflict`.

### Escrita autorizada após dry-run válido

Se o dry-run encontrar exatamente os 203 alvos e zero conflito inesperado:
- atualizar somente `articles.body` para o body sanitizado;
- atualizar somente `article_external_sources.source_hash` para o hash calculado a partir do conteúdo sanitizado;
- preservar status (published/archived), título, subtitle, datas, editoria, localidade, autoria, external_id, source_url e mídias;
- não deletar nada;
- não alterar `media_assets` nem `article_media`;
- não reabrir/reexecutar o lote 2019-2020;
- não fazer refetch.

Se existir conflito de body em qualquer item, corrigir automaticamente apenas os que baterem exatamente e deixar os divergentes intocados e documentados.

### Validação

Depois:
- quantos dos 203 foram corrigidos;
- quantos ficaram `manual_conflict`;
- confirmar que nenhum body corrigido ainda contém o padrão de resíduo;
- confirmar que total físico/status de articles não mudou;
- confirmar que contagens de media/external_sources não mudaram;
- confirmar que o lote 2019-2020 continua `complete`;
- confirmar 0 alteração fora da lista dos 203 external_ids.

Criar `docs/legacy-html-residue-fix-2019-2020.md`, atualizar `docs/AI_HANDOFF.md` e status, commit/push e PARAR.

Ainda não executar a carga real 2021-2022 nesta fase.


## Revisão da Fase 44D — aprovada; AUTORIZADA a carga real de 2021-2022

Revisado no GitHub sobre o HEAD `8629c03`.

### Fase 44D aprovada

A correção pontual dos 203 artigos de 2019-2020 está consistente com a autorização:
- dry-run encontrou exatamente 203/203 alvos;
- 0 conflitos e 0 não-encontrados;
- body comparado byte-a-byte antes de qualquer escrita;
- 203/203 corrigidos;
- 0 resíduo remanescente;
- totals físicos de articles/external_sources/article_media inalterados (9.213 / 9.213 / 14.200);
- lote 2019-2020 permaneceu `complete`;
- nenhuma reexecução do lote e nenhum refetch.

### AUTORIZADO AGORA — carga real 2021-2022

Executar o import real do lote **2021-2022**, usando o cache já pronto/sanitizado.

Números esperados do preflight aprovado:
- eligible: **4.475**
- needs_review: **13** (ficam fora)
- quarantined: **0**
- rejected: **0**
- referências de imagem: **6.889**

Regras:
1. não refazer coleta/preflight de rede;
2. não importar os 13 `needs_review`;
3. não usar `--limit` na carga completa;
4. acompanhar o progresso já implementado;
5. se houver falha transitória de imagem, fazer retry/reconciliação idempotente como nos lotes anteriores;
6. só considerar concluído quando o batch fechar `complete` com 4.475/4.475 artigos contabilizados e 6.889/6.889 referências de imagem reconciliadas, com 0 falhas pendentes;
7. rodar `batch-final-validate.mjs --batch=2021-2022` após a carga;
8. confirmar 0 vazamento de `needs_review` e 0 exceções de data na carga;
9. confirmar 0 duplicidade por identidade (`provider+external_id/source_url`) dentro do lote e globalmente.

### Duplicatas editoriais

Após a validação técnica da carga, rodar auditoria de candidatos a duplicata para o novo lote, **sem arquivar automaticamente**:
- título sozinho nunca decide;
- título+mesma data é apenas candidato;
- confirmação exige corpo idêntico/quase idêntico;
- registrar suspeitos para revisão posterior.

### PARAR depois

Ao concluir e validar 2021-2022:
- gerar relatório final do lote;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- PARAR para conferência.

Não iniciar 2023-2024 ainda. Não gerar Preview ainda. Não fazer Production.


## Revisão da Fase 44E — carga 2021-2022 aprovada; limpar somente duplicatas confirmadas antes de 2023-2024

Revisado no GitHub sobre o HEAD `d574fd5`.

### Fase 44E aprovada

A carga e validação de 2021-2022 estão consistentes:
- 4.475/4.475 artigos;
- 6.889/6.889 referências de imagem;
- 0 falhas finais;
- 13 needs_review fora da carga;
- 7 exceções de data fora da carga;
- 0 duplicidade por identidade global;
- 13.688 articles / 13.688 external_sources / 21.089 media_assets no acumulado dos 4 lotes;
- lote 2021-2022 em status `complete`.

### Duplicatas editoriais confirmadas

A auditoria pós-carga encontrou:
- 8 grupos novos de 2021-2022 com corpo idêntico após normalização — **confirmados para limpeza**;
- 3 grupos de 2021-2022 com corpo apenas quase igual — **NÃO tocar**, continuam para inspeção manual;
- 2 pares antigos de 2019-2020 que, após a sanitização da Fase 44D, ficaram com corpo byte-a-byte idêntico — **confirmados para limpeza**;
- os demais grupos antigos ainda pendentes continuam intocados.

Total confirmado nesta etapa:
- **10 grupos**
- **23 artigos envolvidos**
- **13 artigos a arquivar**
- **10 canônicos a manter publicados**

### AUTORIZADO AGORA — limpeza reversível desses 10 grupos somente

Usar a MESMA regra determinística já aprovada na Fase 43:
1. tem capa > sem capa;
2. editoria específica > Geral;
3. published_at mais recente;
4. maior external_id numérico como desempate final.

Regras de segurança:
- dry-run primeiro e conferir exatamente 10 grupos / 23 artigos / 13 a arquivar;
- nenhum DELETE;
- arquivar somente os 13 não-canônicos (`status=archived`, `archived_at`);
- preservar article_external_sources, media_assets e article_media;
- não tocar os 3 grupos `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL` de 2021-2022;
- não tocar os 9 grupos antigos ainda pendentes;
- não tocar os 54 grupos já resolvidos além de confirmar que permanecem corretos;
- validar que cada grupo confirmado termina com exatamente 1 published.

Gerar relatório da limpeza, atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`, commit/push e PARAR.

Não iniciar 2023-2024 ainda. Não gerar Preview ainda.


## Revisão da Fase 44F — aprovada; AUTORIZADO somente preflight de 2023-2024

Revisado no GitHub sobre o HEAD `dc0ee49`.

### Fase 44F aprovada

A limpeza bate exatamente com o autorizado:
- 10 grupos / 23 artigos;
- 13 arquivados / 10 canônicos mantidos;
- 0 DELETE;
- 10/10 grupos terminaram com exatamente 1 published;
- 13/13 arquivados com `archived_at`;
- totais físicos preservados: 13.688 articles / 13.688 external_sources / 21.089 article_media;
- published legado = 13.614, coerente com 13.688 - 61 - 13;
- 3 grupos de 2021-2022 em inspeção continuam intocados;
- 9 grupos antigos pendentes continuam intocados.

### AUTORIZADO AGORA — somente preflight/auditoria de 2023-2024

Seguir o mesmo fluxo seguro usado no lote anterior, sem import real ainda.

Antes de qualquer coleta longa:
1. informar quantas candidatas 2023-2024 existem no inventário;
2. quantos detalhes já existem em cache local;
3. quantos ainda faltam buscar;
4. reutilizar integralmente qualquer cache/checkpoint existente;
5. não invalidar cache por causa das mudanças de sanitização — o parser atual já sanitiza novos fetches.

Depois:
- executar somente o preflight de 2023-2024;
- buscar apenas detalhes faltantes;
- aplicar a barreira de integridade + sanitização atual;
- gerar eligible / needs_review / quarantined / rejected;
- contar imagens, referências e URLs únicas;
- distribuição por editoria;
- destacar qualquer categoria nova, especialmente `classificados` se aparecer;
- gerar relatórios equivalentes aos lotes anteriores;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- PARAR para conferência.

Ainda NÃO autorizado:
- import real de 2023-2024;
- iniciar 2025-2026;
- gerar novo Preview;
- fazer Production.


## Revisão da Fase 45 — preflight 2023-2024 aprovado; AUTORIZADA a carga real

Revisado no GitHub sobre o HEAD `7f0928c`.

### Preflight aprovado

Números conferidos:
- candidatas: **4.297**
- eligible: **4.292**
- needs_review: **2**
- quarantined: **3**
- rejected: **0**
- com imagem / sem imagem: **4.276 / 16**
- referências de imagem: **7.165**
- URLs únicas de imagem: **7.165**

Amostra sem sinais do resíduo HTML já corrigido nos lotes anteriores.

### Classificados

Os 3 itens em `classificados` permanecem fora da carga automática nesta etapa. O conteúdo parece ser notícia comum publicada sob a categoria errada no legado, então NÃO mapear cegamente para Classificados nem inferir nova editoria automaticamente agora.

Eles continuam preservados em `quarantined` para revisão manual posterior:
- 531838 — PROUNI...
- 531843 — 61 baleias-francas...
- 604963 — CCR ViaCosteira...

### AUTORIZADO AGORA — carga real 2023-2024

Importar somente os **4.292 eligible** usando o cache já completo.

Regras:
1. sem refetch;
2. sem `--limit`;
3. não importar os 2 `needs_review`;
4. não importar os 3 `quarantined/classificados`;
5. expected articles = **4.292**;
6. expected image references = **7.165**;
7. retry/reconciliação idempotente apenas se houver falha transitória;
8. só fechar como `complete` com 4.292/4.292 e 7.165/7.165, 0 falhas;
9. rodar `batch-final-validate.mjs --batch=2023-2024`;
10. confirmar 0 vazamento de needs_review/quarantined/exceções de data e 0 duplicidade por identidade.

Depois da validação:
- rodar auditoria de duplicatas somente leitura;
- não arquivar nada automaticamente;
- gerar relatório final;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- PARAR para conferência.

Não iniciar 2025-2026 ainda. Não gerar Preview ainda. Não fazer Production.


## Revisão da Fase 45B — aprovada; limpar 1 duplicata confirmada antes de 2025-2026

Revisado no GitHub sobre o HEAD `008f016`.

### Fase 45B aprovada

O lote 2023-2024 fechou corretamente:
- 4.292/4.292 artigos;
- 7.165/7.165 referências de imagem;
- 0 falhas finais;
- migration BMP aplicada e reconciliada;
- 2 needs_review e 3 quarantined/classificados ficaram fora;
- 0 duplicidade por identidade global;
- acumulado: 17.980 articles / 17.980 external_sources / 28.254 media_assets;
- lote 2023-2024 em `complete`.

### Duplicatas editoriais

A auditoria pós-carga encontrou 2 candidatos novos:
- `CASOS DE DENGUE AUMENTAM 900% EM SC` (external_ids 572497 / 572509): corpo idêntico => **duplicata confirmada**;
- `SANCIONADA LEI QUE CRIMINALIZA BULLYING...` (569333 / 569372): corpo apenas quase igual => **NÃO tocar**, continua para inspeção manual.

### AUTORIZADO AGORA — limpeza reversível de somente 1 grupo

Aplicar a mesma regra determinística já aprovada:
1. tem capa > sem capa;
2. editoria específica > Geral;
3. published_at mais recente;
4. maior external_id numérico como desempate.

Regras:
- dry-run primeiro;
- deve encontrar exatamente **1 grupo / 2 artigos / 1 a arquivar / 1 canônico**;
- nenhum DELETE;
- arquivar somente o não-canônico com `status=archived` e `archived_at`;
- preservar article_external_sources, media_assets e article_media;
- não tocar o grupo 569333/569372;
- não tocar os 13 candidatos antigos pendentes;
- validar que o grupo termina com exatamente 1 published;
- atualizar relatório, AI_HANDOFF e legacy-migration-status;
- commit/push e PARAR.

Ainda não iniciar o preflight 2025-2026 nesta mesma etapa.


## Revisão da Fase 45C — aprovada; AUTORIZADO somente preflight de 2025-2026

Revisado no GitHub sobre o HEAD `3090bf4`.

### Fase 45C aprovada

A limpeza está coerente com a autorização:
- dry-run: 1 grupo / 2 artigos / 1 a arquivar / 1 canônico;
- mantido `572509` (editoria específica `saude`);
- arquivado `572497` (`geral`);
- nenhum DELETE;
- totais físicos preservados: 17.980 articles / 17.980 external_sources / 28.254 article_media;
- published legado = 17.905;
- grupo 569333/569372 continua intocado;
- 13 candidatos antigos pendentes continuam intocados.

### AUTORIZADO AGORA — somente preflight/auditoria de 2025-2026

Este é o último lote cronológico. Ainda NÃO importar.

Antes da coleta:
1. informar quantas candidatas 2025-2026 existem no inventário;
2. informar quantos detalhes já existem em cache local;
3. informar quantos ainda faltam buscar;
4. reutilizar integralmente cache/checkpoint existente;
5. buscar somente o que faltar.

Depois:
- executar somente o preflight de 2025-2026;
- aplicar sanitização e barreira de integridade atuais;
- gerar eligible / needs_review / quarantined / rejected;
- contar com imagem / sem imagem, referências e URLs únicas;
- distribuição por editoria;
- destacar qualquer categoria nova ou ocorrência de `classificados`;
- verificar tipos de mídia incomuns antes da futura carga (especialmente MIME/extensões não cobertas);
- gerar amostra e relatórios equivalentes aos lotes anteriores;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- PARAR para conferência.

Ainda NÃO autorizado:
- import real de 2025-2026;
- revisão/forçamento dos casos needs_review/quarantined;
- novo Preview;
- Production.


## Revisão da Fase 46 — preflight 2025-2026 quase aprovado; corrigir inconsistência da auditoria de extensões antes da carga

Revisado no GitHub sobre o HEAD `c2b7f0a`.

### Parte principal do preflight conferida

Os números editoriais do lote estão coerentes:
- candidatas: **5.341**
- eligible: **5.312**
- needs_review: **2**
- quarantined/classificados: **27**
- rejected: **0**
- referências de imagem elegíveis: **16.035**
- URLs únicas elegíveis: **16.035**
- sanitização de resíduo HTML: 0 casos.

Os 2 needs_review e os 27 classificados continuam corretamente fora de qualquer carga automática.

### BLOQUEIO antes da importação real — contagem de extensões não fecha

A tabela de extensões do relatório soma **21.408 ocorrências**:
10.836 jpg + 4.680 jpeg + 3.371 jfif + 1.765 png + 738 webp + 12 gif + 4 mhtml + 2 enc = **21.408**.

Mas o próprio preflight informa **16.035 referências de imagem elegíveis** e **16.035 URLs únicas elegíveis**.

Essa diferença de **5.373** não é explicada pelos itens excluídos: os 27 quarantined têm apenas 41 imagens documentadas e os 2 needs_review têm 5, totalizando 46.

Antes de autorizar a carga, corrigir SOMENTE essa auditoria, sem refetch de matérias e sem importação.

### O que fazer agora

1. Recalcular localmente, a partir do cache já completo de 2025-2026, usando exatamente o mesmo conjunto `eligibleList` e a mesma função `collectImageRefs(detail)` usada pelo preflight/importador.
2. Para cada referência, classificar a extensão de forma **mutuamente exclusiva** usando somente o pathname da URL (ignorando query string).
3. A soma de todos os buckets de extensão + bucket `sem_extensao/outro` deve fechar exatamente em **16.035**.
4. Informar também URLs únicas por extensão.
5. Para extensões incomuns, preservar a verificação de MIME já feita; se a lista correta de URLs incomuns mudar, verificar apenas as novas amostras necessárias via HEAD.
6. Corrigir `docs/legacy-preflight-2025-2026.md`, `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json` com os números consistentes.
7. Commit/push e PARAR para nova conferência.

NÃO importar 2025-2026 ainda. NÃO iniciar Preview/Production.


## Revisão da Fase 46B — aprovada; AUTORIZADA carga real de 2025-2026

Revisado no GitHub sobre o HEAD `b63830e`.

### Fase 46B aprovada

A inconsistência da auditoria de extensões foi corrigida corretamente:
- a contagem agora usa exatamente `eligibleList + collectImageRefs(detail)`;
- buckets mutuamente exclusivos pelo pathname;
- soma das extensões = **16.035**, exatamente igual às referências elegíveis;
- números editoriais do preflight permaneceram inalterados;
- nenhum refetch e nenhuma importação nesta correção.

Preflight final aprovado:
- candidatas: **5.341**
- eligible: **5.312**
- needs_review: **2**
- quarantined/classificados: **27**
- rejected: **0**
- com imagem: **5.311**
- sem imagem: **1**
- referências de imagem: **16.035**
- URLs únicas no lote: **16.035**

### AUTORIZADO AGORA — carga real do último lote 2025-2026

Executar somente a carga dos **5.312 eligible**, usando o cache completo já existente.

Regras:
1. sem refetch de matérias;
2. sem `--limit`;
3. manter os **2 needs_review** fora;
4. manter os **27 quarantined/classificados** fora;
5. manter as **7 exceções de data** fora;
6. expected_articles = **5.312**;
7. expected_image_refs = **16.035**;
8. retry/reconciliação apenas para falhas pontuais/transitórias;
9. se surgir MIME real não suportado, falha sistêmica, divergência de contagem ou outro bloqueio não previsto, PARAR e reportar antes de alterar configuração/dados;
10. fechar `legacy_migration_batches.status=complete` somente com 5.312/5.312 artigos e 16.035/16.035 referências reconciliadas, 0 falhas finais.

Depois da carga:
- rodar `batch-final-validate.mjs --batch=2025-2026`;
- confirmar 0 vazamento de needs_review/quarantined/exceções de data;
- confirmar 0 placements;
- confirmar 0 duplicidade por identidade no lote e global;
- auditar candidatos a duplicata editorial SOMENTE LEITURA, sem arquivar automaticamente;
- gerar relatório final do lote e relatório de duplicatas;
- atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`;
- commit/push;
- PARAR para conferência.

Ainda NÃO gerar Preview e NÃO fazer Production nesta etapa.


---

## Revisão da Fase 46C — APROVADA / migração histórica 2015–2026 concluída

Revisado diretamente no GitHub sobre o HEAD `ff9ce6d` (carga em `6defdfe` + atualização documental em `ff9ce6d`).

Os artefatos da Fase 46C estão coerentes entre `docs/AI_HANDOFF.md`, `docs/legacy-migration-status.json`, `docs/legacy-batch-2025-2026-final.md` e `docs/legacy-duplicate-audit-2025-2026.md`.

### Lote 2025–2026 confirmado

- 5.312/5.312 artigos e fontes externas;
- 16.035/16.035 mídias e vínculos;
- 0 falhas finais;
- 2 Gateway Timeout transitórios reconciliados no retry;
- nenhum MIME real não suportado;
- 5.311 matérias com exatamente 1 capa e 1 sem imagem;
- 0 placements;
- 0 vazamento dos 2 needs_review;
- 0 vazamento dos 27 quarantined/classificados;
- 0 vazamento das 7 exceções de data;
- distribuição editorial idêntica ao preflight aprovado;
- `legacy_migration_batches.status = complete`.

### Checagem global

A aritmética dos 6 lotes fecha em 23.292 artigos/fontes/slugs e 44.289 mídias, com unicidade global documentada por identidade, URL de origem e storage_path.

Portanto a carga histórica 2015–2026 está **tecnicamente concluída**.

### Duplicatas

A auditoria permaneceu somente leitura, como autorizado:

- 65 grupos já resolvidos;
- 5 candidatos novos envolvendo 2025–2026;
- 14 candidatos antigos ainda pendentes;
- nenhum novo arquivamento automático.

**NÃO fazer limpeza adicional de duplicatas agora.** Os 19 grupos pendentes ficam preservados para revisão editorial específica futura.

Observação documental pequena: o comentário interno de `scripts/legacy-audit/duplicate-audit-2025-2026.mjs` ainda menciona “13 candidatos antigos” em um trecho, enquanto o resultado final correto é 14. Isso é comentário desatualizado e não altera o cálculo nem bloqueia a aprovação; corrigir quando o arquivo for tocado novamente.

## Próxima etapa autorizada — painel editorial operacional

Com a migração encerrada, está autorizado concentrar o trabalho no painel em branch própria, sem alterar os dados históricos:

- integrar a branch `feature/painel-editorial-operacional-20260927` com o HEAD final da migração;
- manter o fluxo do editor em **Matéria → Imagens → Publicação e destaque**;
- manter listagens de matérias/mídias paginadas e filtradas no servidor;
- manter a gestão de destaques em área própria, com seleção também disponível na matéria;
- manter PDFs das novas edições fora do Supabase Storage: o desenho aprovado é Google Drive/Jornal Online, com o Supabase guardando apenas referência/URL;
- revisar autenticação/auditoria/RLS e eliminar o resíduo `SIMULATED_AUDIT` somente se a sessão real permitir fazê-lo sem quebrar os fluxos existentes;
- validar typecheck/build antes de teste manual;
- depois fazer teste manual local do fluxo completo, sem Preview/Production nesta etapa.

Nenhuma ação em Production está autorizada por esta revisão.
