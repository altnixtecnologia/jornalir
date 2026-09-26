# Revisão do ChatGPT — Fase 35D

Revisado diretamente no GitHub sobre o HEAD `f8f0154`.

## Veredito

**CANÁRIO APROVADO. AUTORIZADO CONCLUIR O LOTE 2015–2016.**

O canário real passou:
- 20 matérias corretas;
- 45 imagens corretas;
- validação direta no Supabase/Storage com `allOk=true`;
- segunda execução idempotente sem duplicações;
- 0 falhas;
- nenhuma placement criada;
- role/sort_order preservados;
- lote permaneceu `incomplete`, corretamente.

O achado isolado de decodificação no título `external_id=416746` não bloqueia a carga. Manter documentado para correção pontual posterior.

## Próxima etapa — completar 2015–2016

Executar a importação do lote completo 2015–2016 usando o mesmo motor já validado.

Regras obrigatórias:
1. Importar somente as **1.622 elegíveis**.
2. As 20 do canário devem ser reencontradas/reconciliadas, nunca duplicadas.
3. Os **13 `needs_review` continuam fora** da carga automática.
4. Não importar exceções de data `31/12/1969`.
5. Não iniciar 2017–2018 nesta etapa.
6. Nenhuma placement deve ser criada.
7. Manter localidade `geral` para o legado.
8. Se houver falha de artigo ou imagem, NÃO marcar o lote como `complete`.

## Execução

Usar o mesmo comando, agora **sem `--limit`**:

`node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit --rps=4`

Se o sandbox bloquear a escrita, parar e pedir ao usuário apenas para executar exatamente esse comando manualmente. Não contornar a proteção.

## Validação obrigatória após a carga

Consultar diretamente Supabase/Storage e confirmar:

- 1.622 `articles` do lote elegível 2015–2016 reconciliadas;
- 1.622 `article_external_sources` correspondentes;
- 3.025 referências de imagem reconciliadas;
- nenhuma duplicata de `media_assets.origin_source_url`;
- nenhuma duplicata em `article_media`;
- 0 falhas de artigos;
- 0 falhas de imagens;
- capa/galeria e `sort_order` corretos;
- objetos de Storage existentes;
- nenhuma placement;
- 13 `needs_review` continuam fora;
- `legacy_migration_batches.status = complete` SOMENTE se todas as reconciliações acima fecharem exatamente.

A validação final deve ser baseada no estado real do banco, não apenas nos contadores do processo.

## Relatório

Atualizar:
- `docs/AI_HANDOFF.md`
- `docs/legacy-migration-status.json`
- criar `docs/legacy-batch-2015-2016-final.md`

Registrar números finais, falhas/retries se houver, contagens reais do banco e qualquer divergência.

Commit/push e PARAR antes de 2017–2018.

## Decisões mantidas

- prioridade histórica: preservar corretamente o dia/data; diferença de 1h por DST não bloqueia;
- `raw_metadata` mantém o valor bruto original;
- os 13 casos manuais não são descartados nem importados automaticamente;
- o problema isolado do `?` no título 416746 fica para correção pontual posterior.
