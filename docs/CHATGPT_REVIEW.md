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
