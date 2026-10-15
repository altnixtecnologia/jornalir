# Jornal IR — aplicativos mobile e notificações

Situação de 15/10/2026: planejamento e base de app instalável do Sistema. **Não** há push nativo nem alarme local prontos, e nenhum app foi enviado às lojas.

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
