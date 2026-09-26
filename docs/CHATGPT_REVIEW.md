# Revisão do ChatGPT — Fase 35E concluída / início 2017–2018

Revisado diretamente no GitHub sobre o HEAD `1d84c96`.

## Veredito do lote 2015–2016

**APROVADO E ENCERRADO.**

Confirmado no GitHub:
- 1.622/1.622 matérias elegíveis migradas;
- 1.622/1.622 external sources;
- 3.025/3.025 media assets;
- 3.025/3.025 vínculos article_media;
- 0 duplicatas;
- 0 placements;
- 0 falhas finais;
- 13 needs_review continuam fora;
- 7 exceções de data continuam fora;
- 80 GIFs reconciliados após migration;
- `legacy_migration_batches.status = complete`.

A migration `20261005100000_article_media_allow_gif.sql` está correta: apenas acrescenta `image/gif` aos MIME permitidos do bucket `article-media`, sem recriar bucket, apagar objetos ou alterar policies.

O validador final é paginado e não fica limitado às primeiras 1.000 linhas.

O problema isolado de decodificação do título `external_id=416746` continua documentado para correção pontual posterior e não invalida o lote.

## Próxima etapa — 2017–2018

**AUTORIZADO SOMENTE PREFLIGHT/AUDITORIA DO LOTE 2017–2018. AINDA NÃO IMPORTAR.**

Executar o mesmo pipeline de coleta/classificação para 2017–2018, sem escrita real, e produzir os números do lote antes de liberar a carga.

Obrigatório:
1. Rodar preflight completo de 2017–2018.
2. Manter a mesma barreira de integridade editorial.
3. Levantar:
   - candidatas;
   - eligible;
   - needs_review;
   - quarantined;
   - rejected;
   - com/sem imagem;
   - referências de imagem;
   - URLs únicas;
   - distribuição por editoria.
4. Identificar se aparecem `agricultura` e/ou `classificados`.
5. `classificados` continua em quarentena automática.
6. Se `agricultura` aparecer, fazer amostra/revisão da categoria antes de liberá-la.
7. Não inferir localidade; legado continua `Geral`.
8. Não importar nenhuma matéria/imagem ainda.
9. Não tocar em 2019–2020.

Gerar/atualizar:
- `docs/AI_HANDOFF.md`;
- `docs/legacy-migration-status.json`;
- criar relatório do preflight 2017–2018;
- se houver casos para revisão, criar relatório legível específico deles.

Commit/push e PARAR para nova conferência do ChatGPT.

## Decisão de interface já definida pelo usuário

Para o bloco visual **“Mais destaques”** (`localSpotlight`), a intenção é deixar automático pelas matérias publicadas mais recentes, ordenadas por **`published_at`** e não por `created_at`, para que a migração de conteúdo antigo não faça matérias de 2015/2016 aparecerem como novas.

Não implementar essa alteração durante o preflight 2017–2018; apenas manter registrada para a próxima etapa de portal/UI.
