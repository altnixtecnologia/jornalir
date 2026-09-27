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
