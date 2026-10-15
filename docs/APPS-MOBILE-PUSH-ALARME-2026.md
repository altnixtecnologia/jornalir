# Jornal IR — aplicativos mobile e notificações

Situação de 15/10/2026: base instalável do Sistema. Web Push e fila de entregas estão sendo implementados no lote de desenvolvimento; **ainda não foram publicados/ativados**, não há alarme nativo pronto e nenhum app foi enviado às lojas.

## Estratégia
- Continuar evoluindo desktop e mobile juntos. Não postergar a estrutura de navegação mobile até o final.
- O site público já conta com manifest PWA e service worker; o sistema passa a ter manifest PWA e ícones de instalação. Não armazenar dados autenticados em cache offline.
- Telas compartilhadas em Next.js; avaliar Capacitor com aplicações Android e iOS separadas quando forem necessárias notificações locais, canais de som e alarmes.
- Atualizações de conteúdo e interface podem ser web; mudanças em plugins nativos, permissões e canais de notificações exigem novo binário e aprovação das lojas.

## Jornal IR público
- Push editorial comum com link para matéria.
- Push urgente distinto, com categoria editorial própria, som característico e vibração quando o aparelho permitir.
- Preferências opt-in por pessoa/dispositivo e assuntos; cidade/editoria e suspensão de notificações.
- iOS: web push em web apps instalados requer consentimento e condições específicas; Critical Alerts exige entitlement especial e não pode ser presumido.
- Android: canal de notificação urgente com som personalizado precisa ser criado pela camada nativa; usuários podem silenciar canais e o modo Não Perturbe pode bloquear alertas.

## Jornal IR Sistema
- Alertas administrativos e lembretes para responsáveis da Agenda.
- Lembrete com antecedência, deep link do compromisso, leitura/edição conforme RLS e idempotência de envios.
- Um alarme que funcione com o app fechado não pode depender de timers JavaScript numa aba suspensa. Avaliar notificações locais Android (AlarmManager e requisitos de permissões conforme versão) e iOS, com homologação em hardware real.
- Telegram continua complementar e não é substituto de alarme nativo.

## Backend futuro compartilhado
1. notification_devices: usuário ou assinante, identificador do app, plataforma, token/endpoints, status, timestamps e revogação.
2. notification_preferences: consentimento, editorias/cidades, agenda, urgentes, som e vibração.
3. notification_events e notification_deliveries: tipo, conteúdo, link, prioridade, agenda, tentativas, idempotência.
4. Endpoints autenticados de ativação/desativação; segredo push exclusivamente no servidor.
5. Envio agendado, tentativas limitadas e observabilidade. Deep links específicos para notícia, pauta e compromisso.

## Etapas
- [x] Experiência web existente.
- [x] Primeira reformulação de menu mobile do Sistema — validar visualmente no aparelho.
- [x] Manifest e ícones do Sistema — instalar e testar no aparelho; não equivale a app nativo.
- [ ] Homologar instalação Android/iOS.
- [ ] Criar som exclusivo original/licenciado para o Jornal IR.
- [ ] Definir consentimento e preferências; implementar backend de tokens/eventos.
- [ ] Push normal e urgente; validar sonoridade, vibração e limites dos sistemas operacionais.
- [ ] Alarmes da Agenda com aplicativo encerrado, empregando suporte nativo se necessário.
- [ ] Empacotamento, assinatura e publicação em lojas.


## Implementação do lote push em preparação (não homologada)
- A fila `notification_outbox` e as inscrições `notification_push_subscriptions` já existiam no Supabase; reutilizadas sem duplicar tabelas.
- O gatilho de publicação editorial já enfileira avisos conforme `notification_mode` normal/urgent.
- Rotas no Sistema: `/api/notifications/subscription` (usuários logados),
  `/api/notifications/site-subscription` (leitores com origem explicitamente permitida)
  e `/api/cron/notifications-push` (somente CRON_SECRET).
- O cadastro anônimo de leitores precisa de `PUSH_SITE_REGISTRATION_ENABLED=true`; manter desligado até a homologação e os controles contra abuso.
- Processador Web Push com HKDF, AES-128-GCM e VAPID ES256, sem dependências externas adicionais.
- O worker envia no máximo três notificações por execução, com fila exclusiva e idempotência; resposta incerta não é reprocessada automaticamente.
- Lembretes pessoais da Agenda são enfileirados ao criar ou alterar compromissos e responsáveis, com verificação antes do envio.
- `20261015120100_notification_push_worker_rpc.sql` e `20261015120200_agenda_push_outbox.sql` precedem a ativação do cron;
  `20261015120400_activate_notification_push_cron.sql` deve ser aplicada apenas depois de publicar a rota protegida.
- A chave pública VAPID já existe na Vercel do Sistema; chave privada e assunto permanecem exclusivos do servidor.
- As telas de inscrição e consentimento do site/Sistema estão em preparação. As notícias urgentes podem priorizar notificações,
  mas **não garantem som/vibração personalizada** no navegador.
- Antes de ligar: revisar limites e consentimento, executar build e testes de permissão/endpoints,
  aplicar migrations em ordem, publicar rotas e então habilitar agendamento; testar em aparelhos reais.

### Permanecem pendentes
- [ ] Homologar Web Push ponta a ponta em Android e iOS com permissões reais.
- [ ] Adicionar proteção/rate limit do cadastro público antes de ligar para leitores.
- [ ] Desenvolver aplicativo nativo e toque próprio licenciado; respeitar silencioso e permissões dos SOs.
- [ ] Implementar lembretes locais da Agenda que despertem mesmo sem conexão; testar em segundo plano.
