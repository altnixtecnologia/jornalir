# Jornal IR — primeiro acesso e autorização de push (19/10/2026)

## Objetivo e segurança
- A caixa de boas-vindas aparece somente dentro do app **Android nativo Capacitor**; navegador comum/PWA não apresenta a caixa nativa.
- Apenas se servidor permitir cadastro e o app ainda não estiver inscrito, e **somente uma vez por instalação/site storage**.
- Botões **Ativar notificações** e **Agora não**; Android só recebe `requestPermissions()` depois do toque explícito em Ativar.
- "Agora não" salvo em `jornalir_native_push_welcome_choice_v1` e nunca reaparece automaticamente; usuário pode ativar depois em sininho → /notificacoes.
- Quem já está inscrito (`jornalir_native_push_subscribed=1`) não recebe a janela; permissão bloqueada pelo Android também não gera insistência.
- Padrão normal e urgente selecionados; preferências locais persistidas em `jornalir_native_push_preferences_v1`, respeitadas na renovação de token FCM.
- Ouvintes `registration`, `registrationError`, `pushNotificationReceived` e `pushNotificationActionPerformed` agora são montados globalmente pelo `apps/site/src/app/layout.tsx`, e não só na rota `/notificacoes`. Um único componente, sem ouvintes duplicados.
- Regra de link recebido: /noticias/<slug>; não aceitar outras URLs de navegação em notificações.
- A página /notificacoes mantém preferências e desativação, mas componente aparece na página via renderização condicional `pathname`; pode ser acessada pelo sininho.
- Nenhuma mudança no APK, Firebase service account, migrações, Vercel do sistema ou flags de envio.
- Corrige experiência do app já instalado quando abrir de novo, pois a aplicação carrega o site remoto.
- Testar em Android limpo/fresh install e em aparelho previamente inscrito, em foreground/background, com armazenamento local intacto; verificar somente um prompt e um registro FCM.

## Fora deste lote — envio automático editorial
- O proprietário definiu que a seleção editorial **sem notificação/normal/urgente** deve disparar push automaticamente quando matéria entra em `published`, inclusive agendamento; salvar ou editar matéria já publicada não pode duplicar.
- O código e a migration para gatilho `20261030100600_article_publish_notification_events.sql` já existem, com `article_publish_events_enabled=false` até liberação.
- A rota geral FCM segue protegida por `NATIVE_FCM_DELIVERY_ENABLED=false` e a migration `20261030100600` depende de migrações anteriores de notificação (conferir `20261030100500`, sem aplicar indiscriminadamente todas).
- Fazer homologação cuidadosa antes de ativar envios automáticos, preservando a preferência editorial.
