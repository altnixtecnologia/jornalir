# Jornal IR — publicação automática de notícias e push (20/10/2026)

## Decisão do proprietário
A seleção **Sem notificação / Normal / Urgente** no editor de matérias tem efeito real quando a matéria entra no ar. Serve para matéria criada manualmente, editada enquanto ainda não publicada, rascunho importado do PDF e publicação agendada. Não requer botão manual.

- `none`: apenas publica; não cria notificação.
- `normal`: cria 1 evento `ordinary` por matéria e entrega aos aparelhos habilitados.
- `urgent`: cria 1 evento `urgent` por matéria e entrega no canal `jornal_ir_urgente_v1`.
- `draft`/`adjusting`/`scheduled`: não notificam antes da publicação.
- Atualizar/re-salvar matéria já publicada não gera aviso novo; só transições reais para publicada; `dedupe_key = article-publish:<article_id>` evita reenvio se arquivar/republicar.
- O botão de notificação manual permanece como ação excepcional da matéria já publicada, **não** uma etapa obrigatória.
- O aviso será mostrado ao leitor no `/notificacoes` e enviado a cada dispositivo Android ou navegador que tenha autorizado o respectivo tipo. Aceite FCM não significa recebimento ou leitura.
- PDF: importa rascunhos; depois passa pelo editor normal e mesmo gatilho `public.articles`. Importação LEGADA publicada diretamente pode ativar notificação se alguém colocar `notification_mode=normal/urgent`; manter `none` no importador.

## Arquitetura
- O gatilho existente `article_push_on_published` gravava na `notification_outbox` antiga, que nenhum worker atual consulta. A migration `20261030100600_article_publish_notification_events.sql` muda a função para inserir em `public.notification_events` e auditar decisão.
- Gatilho é DB, então abrange publicação manual, agendada e importação publicada. Flag DB `site_notification_feature_flags.article_publish_events_enabled` começa `false`.
- Cron PG `agenda-telegram-reminders` chama `/api/cron/agenda-telegram` todo minuto, que por sua vez invoca `runNativePushCron()` (até 10 FCM/run); cron `publish-due-scheduled-articles` também roda a cada minuto.
- Produção Vercel `jornalir-sistema`: `NATIVE_FCM_DELIVERY_ENABLED` deve estar `true` somente após validação. `NATIVE_FCM_REGISTRATION_ENABLED` permanece `true`; `EDITORIAL_PUSH_MANUAL_ENABLED` pode permanecer `false` (automação não depende do envio manual).
- `NATIVE_FCM_TEST_SEND_ENABLED` foi habilitado anteriormente para testes de um aparelho; não dispara por publicação.
- `site_notification_reads` e limite por IP da central de avisos também são migrations relacionadas que precisam ser aplicadas em ordem, sem executar alterações de áreas não relacionadas.
- Não modificar players Altnix, NFS-e, Asaas nem sistemas de outras bases.

## Critérios de aceite
1. Criar matéria rascunho com `none`; publicar; `notification_events` não muda.
2. Criar matéria rascunho com `normal`; publicar; exatamente 1 evento `site/ordinary`, `href=/noticias/<slug>`; confirmar entrega FCM.
3. Agendar matéria com `urgent`; antes da hora 0 eventos, depois 1 evento `site/urgent`, som próprio e clique leva à matéria.
4. Importar do PDF, revisar como rascunho e publicar; exatamente o mesmo comportamento para `none`/`normal`/`urgent`.
5. Editar/re-salvar uma matéria publicada ou arquivá-la e republicá-la não causa aviso duplicado.
6. Confira `native_push_deliveries` e HTTP 200 dos cron jobs; um "sent" é aceito FCM, não comprovante de áudio/exibição.
7. Confirmar consentimento e quantos celulares estão inscritos. Durante preparação havia 3 registros habilitados, apesar do proprietário inicialmente lembrar de 2 celulares: podem ser inscrições antigas/duplicadas. Não inferir identidade física apenas pelo ID.

## Sincronização Claude
Branch `feature/push-automatico-editorial-20261019`; preservar checkout local e os commits próprios da Claude (fetch + comparação, nunca reset nem force). Não repetir migrações aplicadas com versão diferente. Conferir ledger remoto e documentos antes de migrations/push/deploy.
