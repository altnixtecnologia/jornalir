# Revisão do ChatGPT — Fase 35B

Revisado diretamente no GitHub sobre o HEAD `aca77b5`.

## Veredito

**NÃO AUTORIZAR AINDA a primeira gravação real do lote 2015–2016.**

O preflight está consistente (1.622 eligible / 13 needs_review / 0 quarantined / 0 rejected), a amostra de 30 matérias está coerente e a barreira editorial está bem mais segura. Porém ainda existem pontos técnicos que precisam ser corrigidos antes de usar credencial de escrita.

## Bloqueios obrigatórios

### 1. Fuso histórico incorreto

`scripts/legacy-audit/lib/dates.mjs` usa offset fixo `-03:00`.

Isso NÃO representa corretamente o horário histórico de `America/Sao_Paulo`, pois em parte de 2015/2016 havia horário de verão.

Exemplo real:
- 13/01/2016 em São Paulo/SC usa offset histórico `-02:00`;
- 01/07/2016 usa `-03:00`.

Corrigir para conversão baseada na timezone IANA `America/Sao_Paulo`, preservando exatamente o horário local exibido no site antigo e calculando o offset histórico correto para cada data.

Validar pelo menos uma data de verão e uma de inverno.

### 2. Lote pode ser marcado complete sem conferir a quantidade real de imagens

Hoje `imagesReconciled` é apenas:

`batchStats.failedImages === 0`

Isso é insuficiente.

Só marcar `complete` quando:
- artigos reconciliados == expected_articles;
- referências de imagem reconciliadas == expected_image_references;
- zero falhas;
- e a contagem real dos vínculos `article_media` esperados estiver reconciliada.

Registrar explicitamente:
- uploaded;
- reused;
- alreadyLinked;
- linkedTotal;
- expectedReferences;
- failed/pending.

Não depender apenas de ausência de erro.

### 3. Ordem/role das imagens em retomada parcial

`reconcileArticleImages` usa `sortOrder = existingLinks.length`.

Se a capa falhar e uma imagem de galeria entrar primeiro, uma segunda execução pode preservar ordem incorreta.

A reconciliação deve usar a posição ORIGINAL esperada da imagem:
- cover = role cover e posição correspondente;
- gallery = ordem original;
- se a mídia já estiver vinculada mas com role/sort_order divergente, corrigir o vínculo em vez de simplesmente pular.

A retomada precisa reconstruir exatamente capa + galeria + ordem.

### 4. Deduplicação de mídia precisa de garantia no banco

O código procura `media_assets.origin_source_url`, mas hoje não há constraint/índice único que impeça duas execuções concorrentes de criarem a mesma mídia externa.

Adicionar índice único parcial seguro em:
`media_assets(origin_source_url) where origin_source_url is not null`

Como ainda não houve carga real do legado, esta é a hora segura para endurecer isso.

No código, tratar conflito de unicidade de forma idempotente: se outro processo criou a mídia entre SELECT e INSERT, buscar/reusar a existente.

## Revisão humana dos 13 casos

Manter TODOS fora da carga automática por enquanto.

Os casos 2, 3, 6, 9, 10, 11 e 12 possuem texto real e parecem recuperáveis, mas usam estrutura HTML antiga sem `<p>`.

Os casos 1, 4, 5, 7, 8 e 13 têm corpo praticamente/totalmente vazio e precisam de inspeção humana da página/imagens antes de decidir se são:
- publicação baseada principalmente em imagem;
- chamada/comunicado válido;
- conteúdo quebrado;
- ou item que não deve ser migrado como matéria textual.

Não descartar nenhum silenciosamente.

## Amostra de 30 elegíveis

A amostra documentada está internamente coerente:
- títulos de listagem e detalhe coincidem;
- datas/horas coincidem;
- editorias destino estão consistentes;
- há casos com 0, 1 e múltiplas imagens;
- nenhum dos 30 foi sinalizado pela barreira.

Após os 4 bloqueios acima, rodar novamente o preflight 2015–2016 sem gravação. Os números podem permanecer 1.622/13, mas não forçar isso.

## Próximo passo

1. Corrigir os 4 bloqueios.
2. Rodar preflight completo novamente.
3. Atualizar `docs/AI_HANDOFF.md` e `docs/legacy-migration-status.json`.
4. Commit/push.
5. PARAR antes de qualquer escrita real.
6. Não solicitar service-role ainda.

Quando terminar, o usuário apenas avisará ao ChatGPT para conferir novamente.
