# Implantação FCM Android — servidor (19/10/2026)

## Finalidade
Separar **inscrição**, **teste individual** e **envio geral**. O aplicativo Android v.00.02 já está assinado e hospedado no bucket `jornalir-media`. A Claude deve sincronizar estas alterações via GitHub, nunca sobrescrever o checkout local sem conferir `git status`.

## Banco aplicado
- Migration **somente** do FCM nativo aplicada no Supabase `site-system-ir` (`iqnzrpdccecgalqboeyf`), por autorização explícita do proprietário.
- Versão remota registrada: `20261019202943`, nome `native_fcm_devices_delivery`.
- O arquivo que antes se chamava `20261030101100_native_fcm_devices_delivery.sql` foi renomeado, com **conteúdo SQL idêntico**, para `supabase/migrations/20261019202943_native_fcm_devices_delivery.sql`. Não reaplicar com o nome antigo.
- Tabelas: `native_push_devices`, `native_push_deliveries`, `native_push_rate_limits`.
- Confirmado: todas existem, zero aparelhos inscritos no momento da aplicação, anon/authenticated não receberam grants.
- As outras migrations `20261030100100`–`20261030101000` **não foram aplicadas**. Auditar cada uma antes de eventual implantação; a primeira altera por padrão a visibilidade de Assine.

## Fluxo de segurança
1. `NATIVE_FCM_REGISTRATION_ENABLED` libera apenas a inscrição voluntária do Android pelo portal WebView em `/notificacoes`. O usuário deve aceitar os avisos e a permissão do SO.
2. `NATIVE_FCM_TEST_SEND_ENABLED` libera somente a Server Action de testes, acessível por owner/admin do sistema, um `native_push_devices.id` selecionado na tela `/sistema/configuracoes/notificacoes-push`, com confirmação visual e limite via RPC. O texto do evento diz TESTE; usa uma matéria publicada para validar clique.
3. `NATIVE_FCM_DELIVERY_ENABLED` continua `false`: worker e filas **não entregam** eventos para leitores.
4. `EDITORIAL_PUSH_MANUAL_ENABLED` continua `false`; `article_publish_events_enabled` não foi alterado. Nenhum push automático.
5. O `sendFcmToAndroid` original só permite `isolatedTest` quando o flag de teste está ligado; o worker usa a modalidade normal, ainda desativada.
6. Teste não é comprovação de entrega SO; botão confirma somente aceite Firebase.

## URLs e configuração
- Aplicativo: `https://jornalir.vercel.app/notificacoes` dentro do app instalado; componente `NativePushPreferences` deve estar no deploy do **site**.
- Servidor público: `https://controle.altnix.com.br/api/public/push/fcm`; também `/api/public/native-push`.
- Painel do admin: `https://controle.altnix.com.br/sistema/configuracoes/notificacoes-push`.
- Credenciais Firebase já configuradas na Vercel Production segundo auditoria, sem revelação dos valores.
- Google FCM: `jornal-ir-app-5c6e2`; pacote Android `com.jornalir`.
- Não tocar no `altnix-informativo` nem no outro bucket `jornal-ir-edicoes`.
- Correção de alinhamento do logo do header é separada e não deve ser perdida na próxima integração.
- A branch integra o hotfix publicado `ce12db47` (seletores do formulário Matérias), preservando-o no histórico.

## Após baixar localmente pela Claude
1. Conferir worktree local e qualquer commit não publicado (não usar reset/force); fazer fetch e integrar os SHAs completos de forma segura.
2. Rodar typecheck/build de `apps/site` e `apps/sistema` e conferir a compatibilidade com a v.00.02 e o áudio urgente.
3. Abrir no próprio Android a página `/notificacoes`, conceder permissão, ativar **Normal** e **Urgente** e conferir que há **exatamente** o aparelho consentido.
4. Enviar um teste comum e um urgente pelo painel owner/admin. Conferir foreground/background/fechado, canal de áudio, vibração e abertura da notícia. Nunca promover sem isso.
5. Não rotacionar credenciais Firebase nem alterar o keystore/assinatura do APK. Tratar a exposição dos `.env.local` em transcript como item de segurança posterior e rotacionar com troca atômica/rollback.
