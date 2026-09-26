# Revisão do ChatGPT — Fase 35E

Revisado após a execução real completa do lote 2015–2016.

## Veredito

**ARTIGOS CONCLUÍDOS; LOTE AINDA NÃO PODE SER MARCADO COMPLETE POR 80 IMAGENS GIF PENDENTES.**

Resultado da execução real informado pelo processo:
- imported: 1.602
- skippedExisting: 20
- failedArticles: 0
- uploadedImages: 2.900
- alreadyLinkedImages: 45
- correctedImages: 0
- failedImages: 80
- total reconciliado de imagens: 2.945 / 3.025
- status do lote: `incomplete`

As 20 matérias do canário foram corretamente reencontradas e as outras 1.602 foram criadas, totalizando as 1.622 elegíveis.

## Causa das 80 imagens pendentes

As 80 falhas são do mesmo tipo: arquivos com MIME `image/gif` rejeitados pelo bucket `article-media` porque o bucket hoje aceita JPEG/PNG/WebP/AVIF, mas não GIF.

O importador já reconhece `image/gif` e já gera extensão `.gif`; portanto o bloqueio está na configuração do bucket, não no parser nem na reconciliação.

## Correção obrigatória

Criar uma migration incremental, por exemplo:

`supabase/migrations/20261005100000_article_media_allow_gif.sql`

Ela deve atualizar SOMENTE o bucket `article-media` para manter os MIME atuais e acrescentar:

`image/gif`

Não recriar bucket, não apagar objetos e não alterar políticas existentes.

Depois aplicar a migration com `supabase db push`.

## Retry do lote

Após permitir GIF, executar novamente o MESMO comando completo:

`node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit --rps=4`

A execução deve ser idempotente:
- nenhum artigo novo duplicado;
- as 1.622 matérias devem ser reencontradas;
- 2.945 imagens/vínculos já corretos devem ser preservados;
- somente as 80 referências pendentes devem ser reconciliadas.

Se o sandbox bloquear a escrita novamente, pedir ao usuário somente para executar exatamente esse comando manualmente.

## Validação final obrigatória

Depois do retry, consultar diretamente Supabase/Storage e confirmar:

- 1.622 artigos elegíveis do lote;
- 1.622 external sources correspondentes;
- 3.025 referências `article_media` reconciliadas;
- 0 falhas de artigos;
- 0 falhas de imagens;
- nenhuma duplicata de `media_assets.origin_source_url`;
- nenhuma duplicata em `article_media`;
- capa/galeria/sort_order corretos;
- os GIFs existem fisicamente no bucket próprio;
- nenhuma placement;
- 13 `needs_review` continuam fora;
- exceções de data continuam fora;
- `legacy_migration_batches.status = complete` somente se tudo fechar exatamente.

A validação deve consultar o estado real do banco/Storage, não apenas os contadores do importador.

## Relatório

Quando fechar 3.025/3.025:
- criar `docs/legacy-batch-2015-2016-final.md`;
- atualizar `docs/AI_HANDOFF.md`;
- atualizar `docs/legacy-migration-status.json`;
- commit/push;
- PARAR antes de 2017–2018.

## Decisões mantidas

- preservar corretamente o dia/data histórica é prioritário;
- 13 `needs_review` não entram automaticamente;
- o problema isolado de `?` no título 416746 permanece documentado para correção pontual posterior;
- não iniciar o próximo lote enquanto 2015–2016 não estiver 100% reconciliado.
