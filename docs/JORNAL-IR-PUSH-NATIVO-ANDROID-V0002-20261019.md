# Jornal IR — preparação do push Android v.00.02 (19/10/2026)

## Estado auditado
- Monorepo `altnixtecnologia/jornalir`; desenvolver SOMENTE na branch `feature/site-lancamento-editorial-publicidade-20261018`, com fetch + ff-only a partir do SHA atual. Nunca tocar em `main`, fazer reset/force-push ou mexer na assinatura.
- Produção site `jornalir.vercel.app` atualizada com hotfix responsivo do menu (commit `97f8f4c`).
- Admin `controle.altnix.com.br` recebeu apenas hotfix de selects (`ce12db4`, branch separada). Código novo de notificações existe na branch de trabalho, mas NÃO está publicado no admin.
- APK atual: `com.jornalir`, versionName=`v.00.01`, versionCode=2, assinado. Próximo binário deve usar versionCode=3 (v.00.02), MESMO certificado e MESMO package id. Sem assinatura preservada, NÃO distribuir APK.
- Não há Firebase/FCM nativo configurado em `apps/mobile`. `MainActivity` apenas extends BridgeActivity, manifest só tem INTERNET. `server.url` usa o site ao vivo.
- Verificação de banco em 19/10: 0 em `site_push_subscriptions`, 0 em `notification_events`, 0 entregas; mais de uma migration 20261030… pendente. Não está homologado o envio normal/urgente.
- `apps/sistema/src/app/sistema/configuracoes/notificacoes-push/actions.ts` tem trava de envio manual `EDITORIAL_PUSH_MANUAL_ENABLED !== 'true'`; deixar desligada até homologação. A seleção editorial de matéria não é ordem de disparo.

## Áudio urgente recebido do usuário
- Origem: `universfield-new-notification-060-494264.mp3`, 3,792s, estéreo 48kHz.
- Processado para `jornal_ir_urgente.ogg`, Vorbis mono 44,1kHz, 33.056 bytes, SHA-256 `81b4fa057e1172023170e2205011bef8b75b416726bf4fee8d2ab78dfd34ce99`.
- Arquivo convertido disponibilizado como artefato do ChatGPT para o usuário copiar em `apps/mobile/android/app/src/main/res/raw/jornal_ir_urgente.ogg`. NÃO está automaticamente disponível no VS Code nem no GitHub.
- Confirmar direito de uso comercial/redistribuição desse arquivo antes de distribuir publicamente.

## Escopo recomendado para Claude — apps/mobile (sem editar backend em paralelo)
1. Integrar o plugin FCM para Capacitor 7.x com versões compatíveis, verificar as documentações atuais e preservar configuração, navegação e assinatura.
2. Criar dois canais Android explícitos: `jornal_ir_normal_v1` (som padrão) e `jornal_ir_urgente_v1` (som `jornal_ir_urgente.ogg`, importância alta e vibração quando permitida). O backend FCM deve passar o mesmo `channel_id` no payload.
3. Canais Android são imutáveis para som/alertas depois de criados; usar sufixo novo se o som for mudado em versão futura. Nunca apagar/criar canais existentes silenciosamente, preservando preferências do usuário.
4. Solicitar autorização do Android 13+ na interface/contexto de preferência de usuário (não enviar nada antes do consentimento). Padrão de UI para tipos normal e urgente pré-selecionados apenas como escolha; ambos subordinados à permissão do SO.
5. Receber FCM com app aberto, em segundo plano e encerrado; clicar abre `/noticias/{slug}` no portal e evita segunda notificação PWA no mesmo dispositivo. Não tentar sobrepor Não Perturbe/silencioso.
6. Preparar interface de inscrição e status local. Criar contrato documentado com backend para token FCM, preferências, revogação e idempotência. Não colocar service account nem server secrets no APK.
7. Configuração Firebase precisa de projeto Android `com.jornalir` e `google-services.json` correspondente; se ausente, código pode ficar pronto para testes, mas marcar ENTREGA REAL BLOQUEADA.
8. Compilar/verificar assinatura de release só quando os bloqueios estiverem resolvidos, incrementar versionCode, preservar v.00.00 e v.00.01 no R2; não publicar APK sem teste explícito/consentimento do proprietário.

## Backend independente (ainda NÃO operacional)
- Cabe à camada server-only no sistema: registro seguro de tokens FCM, preferências e remoção; Firebase service account somente nas variáveis protegidas da Vercel; filas idempotentes de envio; confirmação humana para aviso já publicado; status de elegíveis/entregas/falhas.
- Definir migrations RLS privadas e plano de aplicação em produção com rollback; nunca publicar funcionalidade como operacional só porque build passou.
- O cron de Web Push atual NÃO entrega automaticamente tokens nativos FCM; requer worker/emissor FCM próprio.
- Não habilitar `EDITORIAL_PUSH_MANUAL_ENABLED` nem `article_publish_events_enabled` sem teste controlado com aparelho inscrito.

## Resultado da implementação — Claude, apps/mobile (19/10/2026, commit `be6b77f`)

**Sincronização:** fast-forward de `ee42cc4` sobre o estado anterior
(`89cdc3a`) sem conflitos; nada descartado.

**Áudio urgente:** conferido — `jornal_ir_urgente.ogg` **não está** em
`res/raw/`, nem no repositório. Não foi substituído por outro som. Nota
detalhada em `apps/mobile/LEIA-ME-AUDIO-URGENTE-PENDENTE.md` (caminho,
SHA-256 esperado, aviso sobre canais imutáveis).

**Implementado:**
- `@capacitor/push-notifications@7.0.7` + `@capacitor/local-notifications@7.0.7`
  (compatíveis com `@capacitor/core@7.6.9`).
- `JornalIrApplication.java`: cria `jornal_ir_normal_v1` (som padrão) e
  `jornal_ir_urgente_v1` (importância alta, vibração, som pelo nome do
  recurso — nunca por `R.raw.*`, então compila mesmo sem o áudio) em
  `Application.onCreate()`, cobrindo o caso de processo iniciado só para
  entrega em segundo plano.
- Manifest: `POST_NOTIFICATIONS`, `VIBRATE`,
  `default_notification_channel_id` como rede de segurança.
- `NativePushPreferences.tsx` (apps/site, só ativo dentro do app via
  `Capacitor.isNativePlatform()`): permissão, registro de token,
  liga/desliga normal/urgente separado, exibição manual em primeiro
  plano (`LocalNotifications.schedule`, obrigatório — Android não mostra
  notificação FCM sozinho com o app aberto), toque abre `data.href` via
  `pushNotificationActionPerformed`, desativar/revogar local.
- `google-services` já estava condicional no `app/build.gradle` (`if
  (file('google-services.json').exists())`) — confirmado funcionando:
  `./gradlew assembleDebug` compilou com sucesso sem o arquivo.

**Depende de Firebase/backend (bloqueado, fora deste escopo):**
1. Projeto Firebase Android `com.jornalir` + `google-services.json` real
   em `apps/mobile/android/app/` — sem isso, `PushNotifications.register()`
   falha silenciosamente no aparelho (listener `registrationError`),
   nunca trava o app.
2. Endpoint de backend `POST/DELETE .../api/public/push/fcm` (contrato
   já chamado pelo cliente, propositalmente igual ao padrão de
   `/api/public/push` já existente para Web Push):
   - `POST {token, platform:"android", ordinary, urgent}` → registra/
     atualiza token + preferências.
   - `DELETE {token}` → desativa.
   - Envio real (payload FCM com `data.kind` "ordinary"/"urgent",
     `data.href`, `android_channel_id` = `jornal_ir_normal_v1` ou
     `jornal_ir_urgente_v1`) — fila/worker FCM, análogo ao cron de Web
     Push existente, mas usando a Admin SDK/API do Firebase. Cabe à
     branch `feature/backend-fcm-notificacoes-20261019`.
   - Sem o endpoint, o cliente falha a chamada de forma tratada (mensagem
     "servidor ainda sendo preparado"), nunca mostra "ativo" de mentira.
3. Apagar duplicidade entre canais: não é um problema HOJE dentro do
   WebView do app (push do navegador não funciona dentro do WebView do
   Capacitor — API ausente), só é risco se o mesmo backend decidir
   disparar Web Push E FCM para o mesmo evento/pessoa; cabe ao backend
   (idempotência por pessoa/evento), não ao cliente.

**Compilação:** `./gradlew assembleDebug` com sucesso (build de
verificação local, não assinado, não distribuído). `versionCode` 2→3,
`versionName` v.00.01→v.00.02 — preparação, **nenhum build de release
gerado nem distribuído**. `typecheck`/`build` de `@ir/site`: limpos.

**Próximos passos para gerar/testar o APK:** (a) decidir sobre o áudio
ausente; (b) criar o projeto Firebase e obter `google-services.json`
real; (c) aplicar a migration/backend do FCM (branch separada); (d) só
então compilar `assembleRelease` com o keystore existente (mesmo
certificado da v.00.01), testar em aparelho real nos 3 estados (aberto/
segundo plano/fechado) antes de qualquer distribuição.

## Verificações de aceitação
- Disparo normal e urgente são botões/ações manuais de usuário autorizado, distintos de apenas publicar uma matéria.
- Zero destinatários = nenhuma entrega/enfileiramento e mensagem explícita.
- Provar recebimento em Android com app ABERTO, SEGUNDO PLANO e FECHADO, incluindo som distinto e toque levando à matéria correta.
- Confirmar canal e som nas configurações do Android, com opção de desativar normal e urgente separadamente.
- Auditar uma mensagem por evento/dispositivo, sem duplicação PWA/FCM.
- Reportar SHA, logs relevantes sem segredos, versões, APK SHA, riscos e os bloqueios de credencial. 
