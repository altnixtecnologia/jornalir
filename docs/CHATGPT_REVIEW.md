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
