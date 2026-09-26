# Revisão do ChatGPT — Fase 35C

Revisado diretamente no GitHub sobre o HEAD `8f4f137`.

## Veredito

**APROVADO PARA CANÁRIO REAL PEQUENO. NÃO AUTORIZADO AINDA O LOTE COMPLETO 2015–2016.**

Os 3 bloqueios da revisão anterior foram implementados:
- reconciliação de referências de imagem passou a conferir quantidade esperada;
- role/sort_order usam a posição original esperada;
- `media_assets.origin_source_url` ganhou índice único parcial e conflito 23505 é tratado de forma idempotente.

O preflight continua:
- 1.635 candidatas;
- 1.622 eligible;
- 13 needs_review;
- 0 quarantined;
- 0 rejected;
- 3.025 referências de imagens elegíveis.

Nenhuma matéria/imagem do legado foi gravada até esta revisão.

## Decisão do usuário sobre data/hora

Para o legado, a prioridade é preservar corretamente o **dia/data** original. Diferença histórica de 1h por horário de verão não bloqueia a migração. O valor bruto original continua preservado em `raw_metadata`.

## Credencial local

O usuário confirmou que as credenciais necessárias já estão no arquivo local `.env.local` na raiz do repositório.

A Claude deve:
- ajustar o script/execução para carregar o `.env.local` da raiz localmente;
- nunca imprimir, versionar ou copiar secrets para relatório/log;
- nunca pedir novamente a service-role em chat;
- usar a credencial apenas no processo local de migração.

O arquivo `.env.local` já está coberto pelo `.gitignore`.

## Observação para o canário

A lógica `linkedTotal` ainda é uma soma de contadores operacionais, não uma consulta final independente do banco. Isso NÃO bloqueia um canário pequeno em banco limpo, mas o canário deve validar diretamente o estado final do Supabase antes de qualquer lote completo.

Não considerar o canário aprovado apenas porque o script terminou sem erro.

## Próxima etapa — CANÁRIO REAL

Importar **somente 20 matérias elegíveis** do lote 2015–2016.

Regras:
1. NÃO importar os 13 `needs_review`.
2. NÃO iniciar 2017–2018.
3. NÃO importar o restante do lote após o canário.
4. Usar `--limit=20`.
5. Carregar a credencial apenas do `.env.local` local da raiz.
6. Se as variáveis ainda não forem lidas pelo processo, corrigir o carregamento do `.env.local` sem expor os valores e continuar.

## Validação obrigatória depois das 20

Consultar o Supabase e validar diretamente as 20 matérias gravadas, não apenas os contadores do script.

Para cada matéria confirmar:
- existe exatamente 1 `article_external_sources` correspondente;
- `origin=legacy_site`;
- título corresponde ao legado;
- data/dia publicado corresponde ao legado;
- `source_url`/external_id correspondem à origem;
- editoria está correta;
- localidade = Geral;
- nenhuma placement foi criada;
- body não contém menu/publicidade/relacionadas/sidebar/rodapé;
- quantidade de imagens corresponde ao esperado daquela matéria;
- capa é role=cover e sort_order correto;
- galeria mantém ordem original;
- `origin_source_url` corresponde à imagem antiga;
- `public_url` aponta para o Storage próprio;
- os objetos do Storage existem.

Depois, executar NOVAMENTE o mesmo canário de 20 para testar idempotência/retomada:
- 0 artigos duplicados;
- 0 `article_external_sources` duplicados;
- 0 `media_assets` duplicados;
- 0 `article_media` duplicados;
- nenhuma ordem/role deve mudar indevidamente.

Como `--limit=20` não cobre o lote inteiro, `legacy_migration_batches` NÃO pode terminar como `complete`.

## Relatório

Criar/atualizar:
- `docs/legacy-canary-2015-2016.md`
- `docs/AI_HANDOFF.md`
- `docs/legacy-migration-status.json`

O relatório do canário deve trazer contagens do banco antes/depois, as 20 identidades importadas, reconciliação de imagens e resultado da segunda execução idempotente.

Commit/push e PARAR.

**Não executar as outras 1.602 matérias sem nova conferência do ChatGPT.**


## Resultado da primeira execução manual do canário

O usuário executou manualmente, na raiz do projeto:

`node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit --limit=20 --rps=4`

Resultado informado pelo próprio processo:

- imported: 20
- skippedExisting: 0
- failedArticles: 0
- uploadedImages: 45
- reusedImages: 0
- alreadyLinkedImages: 0
- correctedImages: 0
- failedImages: 0
- lote permaneceu `incomplete`, como esperado para um canário parcial (20/1622 artigos e 45/3025 referências de imagem).

### Ação imediata

Claude deve agora:
1. Fazer a validação READ-ONLY diretamente no Supabase das 20 matérias e 45 imagens, conforme a seção "Validação obrigatória depois das 20".
2. Se a validação direta estiver correta, preparar a segunda execução do mesmo canário para testar idempotência.
3. Se o sandbox bloquear novamente a segunda escrita, PARAR e informar ao usuário que ele deve repetir EXATAMENTE o mesmo comando manualmente. Não sugerir nenhum comando diferente.
4. Após a segunda execução, validar novamente em modo read-only:
   - total de artigos legados permanece 20;
   - total de external sources permanece 20;
   - nenhuma mídia duplicada;
   - nenhum article_media duplicado;
   - role/sort_order permanecem corretos.
5. Gerar `docs/legacy-canary-2015-2016.md`, atualizar handoff/status, commit/push e PARAR antes das outras 1.602 matérias.
