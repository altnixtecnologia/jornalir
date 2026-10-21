# Jornal IR — backend FCM Android — contrato e implantação (19/10/2026)

## Escopo entregue — ISOLADO, sem disparos
- Branch: `feature/backend-fcm-notificacoes-20261019`; criada a partir de `ee42cc4`, sem alterar a branch em que Claude desenvolve `apps/mobile`.
- Arquivos: `apps/sistema/src/app/api/public/native-push/route.ts`, `apps/sistema/src/app/api/cron/native-push/route.ts`, `apps/sistema/src/lib/notifications/firebaseCloudMessaging.server.ts`, `supabase/migrations/20261030101100_native_fcm_devices_delivery.sql`.
- Reaproveita a tabela `notification_events` (eventos editoriais confirmados por humano), sem segunda tabela de notícias. Não usa API paga de IA.
- Cadastro e envio NÃO habilitados em produção. Nenhuma migration aplicada e nenhuma credencial Firebase lida.

## Contrato para o Android (Claude)
API base: `https://controle.altnix.com.br/api/public/native-push`; chamada do WebView remoto de `https://jornalir.vercel.app` (CORS restrito à origem). A chamada só existirá em produção após integração e deploy do backend.

`GET /api/public/native-push`: resposta pública de status `{platform:"android",registrationAvailable:boolean,deliveryEnabled:boolean}`. Quando `registrationAvailable=false`, não oferecer inscrição ativa; exibir aviso de preparação.

`POST /api/public/native-push`:
```json
{
  "platform": "android",
  "installationId": "29ee4920-b785-4fae-804b-6d22aba79c11",
  "managementToken": "<32-128 caracteres criptograficamente aleatórios, base64url>",
  "fcmToken": "<token FCM do Firebase SDK>",
  "ordinary": true,
  "urgent": true,
  "consented": true
}
```
Regras: gerar installationId UUID e managementToken localmente na primeira execução e preservar em armazenamento seguro; manter o token FCM atualizado, ressincronizando no callback do SDK; só enviar POST quando a pessoa autorizar notificações no SO. Mudar preferências = novo POST usando mesmo par instalação/segredo. Resposta 200: `{ok:true,subscribed:true,ordinary:boolean,urgent:boolean}`.

`DELETE /api/public/native-push`:
```json
{
  "installationId": "29ee4920-b785-4fae-804b-6d22aba79c11",
  "managementToken": "<mesmo segredo local>"
}
```
Resposta 200 `{ok:true,subscribed:false}`. Qualquer falha de rede deve deixar o app honesto sobre o status; não mostrar inscrito sem confirmação do backend. Ambos requerem `Content-Type: application/json`. Nunca transportar managementToken na URL, histórico, logs ou analytics.

**Importante:** o plugin FCM do app precisa registrar os canais Android `jornal_ir_normal_v1` e `jornal_ir_urgente_v1`; o FCM server já os envia em `android.notification.channel_id`. A `data.href` do payload é `/noticias/<slug>`, a `data.kind` é `ordinary|urgent`, e a `data.event_id` deduplica. O canal urgente utiliza o arquivo `res/raw/jornal_ir_urgente.ogg`, providenciado pelo usuário. Não reproduzir via Web Audio em paralelo. Respeitar privacidade, permissões e silencioso do Android.

## Contrato Firebase e Vercel (NÃO habilitar até teste)
1. Criar projeto Firebase do Jornal IR, app Android `com.jornalir`, habilitar Cloud Messaging API v1 e fornecer `google-services.json` SOMENTE no computador da Claude (sem colar dados privados no chat).
2. Obter conta de serviço restrita ao envio FCM com Firebase Cloud Messaging API Admin e armazenar no projeto Vercel `jornalir-sistema`, ambiente Production, como três variáveis **server-only**:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (PEM, preservar linhas `\\n` quando necessário)
3. `NATIVE_FCM_REGISTRATION_ENABLED=true` somente para homologação do primeiro aparelho **depois** da migration aplicada e do backend publicado.
4. `NATIVE_FCM_DELIVERY_ENABLED=true` somente depois de verificar os canais Android, inscrição e credenciais e receber autorização para teste real. Default é falso por ausência da variável.
5. `EDITORIAL_PUSH_MANUAL_ENABLED=true` só depois do cadastro de destinatários e de confirmar o envio manual. Default falso.
6. `article_publish_events_enabled` na migration existente `20261030100600...` permanece `false`, **não ativar automaticamente**.
7. `CRON_SECRET` já existe no sistema. Worker `GET /api/cron/native-push` exige `Authorization: Bearer <CRON_SECRET>`. É integrado também ao processador `GET /api/cron/agenda-telegram` atualmente usado pela rotina já existente; execução periódica só deve começar após inspeção de schedules/credenciais. Em preview, todas as chaves de disparo devem permanecer ausentes.
8. A migration nativa nova é a `20261030101100_native_fcm_devices_delivery.sql`. Não aplicar individualmente fora do controle de ordem das demais migrations `20261030100100` a `01000`, ainda pendentes.

## Segurança e semântica
- `native_push_devices` armazena FCM token confidencial, installationId, hash do segredo local e preferências. RLS habilitado, acesso somente `service_role`; impede que uma instalação tome o token de outra e limita taxa de cadastro a 12 tentativas/15min por IP hash.
- `native_push_deliveries` tem UNIQUE(event_id,device_id) e reserva com `FOR UPDATE SKIP LOCKED`. Não envia eventos anteriores ao consentimento, com mais de 24h, ou cujo conteúdo não pertence a matérias do portal. No máximo 10 tentativas por execução, sem reenvio automático de resultado incerto.
- `status=sent` significa **aceito pelo serviço Firebase**, não significa entrega confirmada ao SO nem leitura.
- Apenas backend server-only usa service_role, CRON_SECRET ou chave da conta Firebase. Nunca colocar no APK.
- No painel `/sistema/configuracoes/notificacoes-push`, contar inscrições Web e Android separadamente e mostrar aceitas pelo Firebase, falhas e pendentes. Botões desligados até env liberar.
- A rota editorial manual `enqueueSitePushAction` verifica admin/owner, confirma urgência e não permite enfileiramento se não houver inscritos para aquele tipo; antes de qualquer envio a eventos existentes, checar duplicidade.

## Checklist de homologação
- [ ] Migration aplicada em ordem (com backup/rollback planejado).
- [ ] Firebase project / service account configurados na Vercel sem exposição de segredos.
- [ ] Build Capacitor 7 Android v.00.02 assinado com mesmo certificado da v.00.01.
- [ ] Primeiro aparelho Android recebe permissão e registra token; o painel mostra o cadastro.
- [ ] Sem inscritos, botão nunca indica envio bem-sucedido.
- [ ] Alerta normal chega com som padrão; urgente chega no canal autoral, observadas as regras de silêncio do Android.
- [ ] App aberto, segundo plano e fechado; clique leva à matéria correta sem notificação em duplicidade.
- [ ] Auditoria diferencia aceito pelo Firebase de recebido/exibido/lido.
- [ ] Teste de revogação garante nenhum novo aviso.
- [ ] Somente após tudo, considerar liberar avisos para leitores e publicar APK, sem sobrescrever versões antigas.

## Revisão adicional de 19/10 — apenas branch (sem deploy ou migration)

Correções preparadas no backend/painel após auditoria estática:
- `40217a3`: no envio manual, confirmar duplicidade repete a Server Action dentro da mesma transição; antes o segundo `submit()` era bloqueado por `pending=true`. A idempotência do `request_id` continua.
- `2fd3261`: o worker FCM verifica novamente a idade do evento (máximo 24h) e atividade recente do dispositivo (60 dias) antes de enviar; lotes reservados e atrasados deixam de ser entregues fora da janela.
- `4886e02`: a ação de envio manual só aceita URL de notícia `/noticias/<slug>`, padrão exigido pelo worker Android. Links de outras páginas eram enfileirados, mas descartados pelo FCM.
- `f6e0e49`: campo de link no painel começa vazio e mostra exemplo correto `/noticias/exemplo`.

**Validação:** trechos e diffs revisados diretamente no GitHub; compilação/typecheck do sistema e testes E2E não foram executados nesta sessão GitHub-only. Claude relatou `assembleDebug` de `com.jornalir` versionCode 3 com áudio verificado no APK, mas seus commits permanecem locais até autorização de push. Somente após sua sincronização e integração é possível build conjunto.

**Banco:** projeto Supabase `site-system-ir` consultado em leitura. Na conferência, `notification_events=0`, `site_push_subscriptions=0`, e as tabelas `native_push_*` não existem. Migrations `20261030100100` a `20261030101100` estão pendentes. A primeira delas acrescenta o interruptor `assine_enabled` com `default false`: aplicar todo o lote indiscriminadamente pode desativar o fluxo /assine. Revisar dependências/rollout individualmente; não alterar banco sem autorização.

**Vercel:** `jornalir-sistema` possui `CRON_SECRET` em Production. Variáveis `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` e controles `NATIVE_FCM_*` não estavam configuradas na conferência. Deixar `NATIVE_FCM_REGISTRATION_ENABLED`, `NATIVE_FCM_DELIVERY_ENABLED` e `EDITORIAL_PUSH_MANUAL_ENABLED` desligadas até homologação.

**Firebase:** Claude relatou projeto Google Cloud `jornal-ir-app`, ainda com erro 403 na etapa `addFirebase`. Não inferir exigência de cobrança apenas do HTTP 403; verificar console Google e detalhes da falha. Não criar um segundo projeto sem confirmar o primeiro.

**Próxima etapa:** receber o HEAD completo da branch Claude; integrar e validar `apps/mobile`+`apps/site`+`apps/sistema`; estabelecer projeto Firebase, migrações e envs; só depois pedir autorização separada para deploy e testes com destinatário consentido.

## Atualização — Firebase Android validado pela Claude em 19/10/2026

**Fonte: relatório da Claude repassado pelo proprietário (ainda sem verificação independente do APK local).**
- Projeto Firebase real: `jornal-ir-app-5c6e2` (não confundir com o identificador inicial de Google Cloud `jornal-ir-app`). Android `com.jornalir` cadastrado; Cloud Messaging API v1 habilitada; `google-services.json` no PC, ignorado pelo Git.
- APK `v.00.02` / versionCode `3` relatado como assinado com o certificado original; tamanho 4.024.205 bytes; SHA-256 `f489a6a801185eac74be7cfcad300548240f236dc9a8284cd45e943c5eee37fa`. Áudio urgente validado e empacotado. **Ainda não publicado, nem testado com push real.**
- **Bloqueio restante:** criação de conta de serviço exclusiva para FCM (`roles/firebasecloudmessaging.admin` no projeto correto) e geração de credencial sensível, dependentes de autorização expressa do proprietário. Não disponibilizar chave em ChatGPT, GitHub, APK, logs ou OneDrive; armazenar somente em ambiente seguro do servidor.
- Somente depois de configurar `FIREBASE_PROJECT_ID=jornal-ir-app-5c6e2`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` na Vercel e da migration revisada, habilitar **cadastro** para um único aparelho autorizado na homologação. Entrega e envios editoriais permanecem desabilitados até teste e autorização separada.
- Claude informou oito commits locais à frente do GitHub; **não integrar antes de esses commits chegarem à branch remota**, preservando a `main` e os trabalhos nas branches.
