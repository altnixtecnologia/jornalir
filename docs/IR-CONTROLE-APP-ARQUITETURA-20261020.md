# IR Controle — arquitetura e regras (20/10/2026)

## Objetivo confirmado
App exclusivo para a equipe Jornal IR, independente de \`com.jornalir\`. Mesmo modelo de app híbrido: WebView Capacitor mostra as páginas já responsivas do sistema \`controle.altnix.com.br\`, autenticação Supabase existente, Agenda/Pauta como única fonte da verdade. Não duplicar dados, telas web ou credenciais no APK.

## Primeira entrega em código
Scaffold em \`apps/mobile-sistema\` com Android/Gradle baseado na estrutura do app público, porém pacote \`com.jornalir.controle\`, nome “IR Controle”, assinatura exclusiva, \`allowBackup=false\` e URL HTTPS do sistema. Canais imutáveis Android v1 criados antes de exibir qualquer notificação: \`ir_controle_avisos_v1\`, \`ir_controle_lembrete_som_v1\`, \`ir_controle_lembrete_vibracao_v1\`, \`ir_controle_lembrete_ambos_v1\`, \`ir_controle_lembrete_silencioso_v1\`. O Android pode alterar os canais nas configurações do aparelho; criar canais por si só não entrega alarmes.
**Não existe APK pronto nem backend conectado de notificações nesta entrega.** Sem instalação, publish ou migrations.

## Notificações futuras — contrato antes de implementar
Preferências por usuário autenticado e opcionalmente por dispositivo: tipo de aviso = \`sound\`, \`vibration\`, \`both\`, \`silent\`; minutos de antecedência = 0,5,10,15,30,60 ou custom; permitir adiar; aviso apenas das tarefas atribuídas e convites relevantes, não broadcast irrestrito. Todas as mudanças auditadas. Proprietário/admin pode delegar e reabrir, operador só dá baixa em própria atribuição.

### Duas camadas de entrega
1. **Push FCM pelo servidor para dispositivos da equipe autenticada**: útil quando muda ou cria compromisso, ou para lembrete agendado pelo cron. Não usar tokens e envios do app público, nem reutilizar canais de notícias. Vínculo por \`auth.uid()\` e RLS, cancelar/revogar tokens ao sair da conta, flag de ativação controlada. Confirmação de aceite pelo FCM ≠ recebimento humano.
2. **Notificação local no Android**, agendada via plugin Capacitor no aparelho para lembretes próximos e funcionamento offline. O servidor é fonte da verdade: login/focus/reconexão sincronizam as próximas ocorrências, edição e cancelamento invalidam alarmes antigos. Limitar janela de agendamento; respeitar hora local America/Sao_Paulo, horário de verão, mudanças do aparelho, permissões. Usar ID estável por \`agenda_event_id + profile_id + scheduled_at + version\`; não duplicar push e local para a mesma ocorrência sem política de deduplicação.
  
No Android 13+ pedir \`POST_NOTIFICATIONS\` após explicação/opt-in. No Android 12+ \`SCHEDULE_EXACT_ALARM\` é negável; verificar com \`checkExactNotificationSetting()\` e oferecer fallback impreciso ou push; não habilitar \`USE_EXACT_ALARM\` sem verificar exigências Android/Play. Verificar sobrevivência a reboot e revogação da permissão. O modo Não Perturbe, economia de bateria e ajustes do usuário podem limitar som/vibração e pontualidade. Nos canais Android 8+, som e vibração são imutáveis para o app depois de criados — IDs v1 distintos; revisar apenas criando novos IDs v2.

### Interação via site
O JavaScript do site não deve tentar tocar som com um \`setTimeout\` em aba fechada. O site pode descobrir a WebView Capacitor (com checagem de origem/app ID quando disponível) e chamar APIs nativas. Eventos nativos abrem \`/sistema/agenda?view=agenda&date=AAAA-MM-DD\`, após validação de sessão/permissões; não aceitar URL arbitrária do payload. HTTPS e redirecionamento de login continuam obrigatórios.

### Privacidade
Registrar FCM token por usuário/dispositivo sem criar notificação pública. \`service_role\` NUNCA no cliente. App não tem login paralelo nem token dentro do APK. Revogar token no logout/desativação, evitar texto sensível de financeiro na notificação bloqueada por padrão; auditar acesso e eventos, sem registrar tokens em metadata. \`allowBackup=false\` para mitigar backup indevido de cookies administrativos.

## Etapas e testes
1. Integrar novo workspace à lockfile (Claude local), \`cap sync android\` e \`assembleDebug\`, conferir URL/login/cookies, navigation/back e abertura lado a lado com app público.
2. Banco dedicado para assinaturas de dispositivos/admin e preferências por usuário com RLS, endpoint seguro de registro/remoção e consulta autorizada de compromissos próximos.
3. Ponte Web ↔ nativo para alertas, reconciliação de avisos locais e no FCM, dedup e agendamento com timezone correto; opções som/vibração/ambos/silencioso e alarmes de teste por opt-in.
4. Testar Android 12/13/14/15: permissões, DND, bloqueio, app fechado, offline, reinício, logout e cancelamento de tarefa; testar visual mobile 360/390/768.
5. Assinatura nova, APK debug/QA e distribuição controlada pelo painel apenas com autorização.

Não tocar \`apps/mobile\`, a branch local da v.00.03, Vercel, Supabase remoto ou APK do público. NENHUMA nova migration/deploy autorizada nesta entrega.
