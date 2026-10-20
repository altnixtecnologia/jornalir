# IR Controle — ORDEM DE EXECUÇÃO PARA CLAUDE CODE
Data: 20/10/2026 · Branch: \`feature/ir-controle-mobile-android-20261020\`
Status: **IMPLEMENTAÇÃO PENDENTE**, não equivale a APK testado nem alarmes operacionais.

## Mandato aprovado pelo proprietário
O app IR Controle é EXCLUSIVO dos colaboradores, distribuído por APK assinado e configurado manualmente em cada telefone quando necessário. Objetivo: **um único APK de homologação funcional** com login, WebView, navegação, Agenda/Pauta, notificações locais confiáveis em segundo plano, push de mudanças FCM, preferências som/vibração/ambos/silencioso e um ASSISTENTE DE CONFIGURAÇÃO com um botão de teste verificável. Builds de desenvolvimento podem ser executados quantas vezes forem necessários internamente; não distribuir protótipos incompletos para o proprietário.

Arquivos de referência obrigatórios:
- \`docs/IR-CONTROLE-V001-ESCOPO-IMPLEMENTACAO-TESTES-20261020.md\`
- \`docs/IR-CONTROLE-APP-ARQUITETURA-20261020.md\`
- \`CLAUDE.md\`, \`docs/STATUS-E-HANDOFF.md\`.
- Base Android independente em \`apps/mobile-sistema\`.
- Correção recente no \`apps/sistema/src/middleware.ts\` para leitura coletiva Agenda e leitura de auditoria apenas delegada. Está na branch, **não** está publicada; testar junto.

## Regras antes de qualquer comando
1. \`pwd\`, \`git status -sb\`, \`git worktree list\`, \`git branch -vv\` ANTES de \`git fetch origin\`.
2. Preservar \`feature/android-back-navigation-v0003-20261020\` (quatro commits locais) e o stash de header mobile. Nada de reset, force, stash pop, cherry-pick cego ou mesclar main divergente. Prefira worktree limpa isolada da branch IR Controle.
3. Conferir commits novos no remoto (branch IR Controle) e executar fast-forward APENAS se ancestralidade/limpeza confirmadas; não sobreescrever qualquer código da Claude.
4. Não atualizar dependências Capacitor/Android sem necessidade; o projeto usa Capacitor 7.6.9, LocalNotifications/Push 7.0.7 e Gradle Android 8.7.2.
5. Não fazer deploy, não aplicar migrations remotas, não habilitar cron ou Firebase em produção, não instalar em aparelhos alheios nem distribuir APK sem autorização posterior.

## Ordem de entrega em lotes (5 itens por vez, com relatório e testes)
### Lote A — integridade do projeto e base Android
A1. Ajustar \`npm install\`/lockfile do novo workspace \`apps/mobile-sistema\`, sem quebrar app público. \`npm run typecheck --workspace @ir/sistema\` e \`@ir/site\`.
A2. \`npm run sync --workspace @ir/mobile-sistema\`, compilar APK debug INTERNAMENTE, corrigir paths/canais de Capacitor/Android. Uma compilação interna não significa distribuição.
A3. Conferir \`applicationId com.jornalir.controle\`, assinatura nova, \`versionName v.00.01\`, manifest/permissões e splash/logo distintos do app público.
A4. Validar login Supabase via WebView remoto, cookies/SSR, sessão expirada/logout, navegação Android Voltar, teclado/safe areas; não armazenar passwords.
A5. Aplicar revisão do \`middleware.ts\` e testar owner, admin delegado, operador ativo e auditoria delegada; confirmar que nenhum operador ganha edição de tarefas alheias.

### Lote B — autenticação de aparelho, preferências, privacidade
B1. Reaproveitar \`public.notification_preferences\` (chave \`profile_id, app_kind='sistema'\`), incluindo \`agenda_enabled\`, \`sound_enabled\`, \`vibration_enabled\`. Não duplicar preferências.
B2. Definir migração NOVA para \`staff_push_devices\` (por \`auth.uid\`, instalação, hash de token FCM, app \`sistema\`), RLS e endpoint AUTENTICADO. \`native_push_devices\` é para o app público e **não** tem vínculo profile_id: NUNCA reutilizar.
B3. API autenticada da Agenda somente para compromissos/convites permitidos ao usuário, com horários absolutos, revisão \`updated_at\` e status da **sua atribuição**. \`service_role\` apenas no servidor, jamais APK.
B4. Tratar logout/inativação e troca de conta no mesmo celular: revogar cadastro FCM e cancelar localmente todos os lembretes do usuário anterior.
B5. Regras de preferência: modo derivado de som/vibração; agenda_enabled OFF = cancelar novos agendamentos; precedente evento \`reminder_minutes\` versus antecedência padrão definida/visível; texto sensível da tela bloqueada genérico por padrão.

### Lote C — alarmes locais e assistente de permissões
C1. Web↔Capacitor bridge real, com \`App.getInfo()\` validando \`com.jornalir.controle\`. Não pressupor que o navegador comum tem Capacitor. Não habilitar alertas no website público.
C2. Criar UI **Configurar alarmes do meu celular**, com estados reais: notificação permitida, alarme exato permitido, canal ativo, próximos alarmes agendados, última sincronização e botão Testar (agenda um aviso local de 60–90s). Nunca exibir “Funcionando” só porque manifest declara permissões; exigir confirmação de som/vibração.
C3. Pedir \`POST_NOTIFICATIONS\` com contexto e \`SCHEDULE_EXACT_ALARM\` pelo fluxo de Configurações Android através de \`checkExactNotificationSetting()\` e \`changeExactNotificationSetting()\`. Em \`App.appStateChange\` refazer check/reconciliação porque revogar o exato APAGA as notificações agendadas. Não usar \`USE_EXACT_ALARM\` como atalho sem análise das regras.
C4. Programar notificações via \`LocalNotifications.schedule\` usando horário local/fuso corretamente, \`allowWhileIdle: true\` nos alertas principais, ids int32 determinísticos e \`getPending()\` antes/depois. Android Doze limita alarmes idle a aprox. um por nove minutos por aplicativo; evitar múltiplos alertas críticos concorrentes ou agregar.
C5. Reconciliação no login, reentrada, alterações Realtime, reconexão, permissão restaurada, edição/cancelamento, tarefa concluída, reboot; cancelar alertas antigos. Explorar plugin nativo de boot se necessário; testar ANTES de afirmar que funciona com celular reiniciado. Janela limitada (7 dias sugeridos) e sem duplicidade push/local.

### Lote D — push complementar e navegação integrada
D1. Firebase Android app \`com.jornalir.controle\` separado, exigir arquivo próprio \`google-services.json\` LOCAL, nenhum token/credencial em Git.
D2. FCM autenticado por usuário ATIVO, apenas eventos da Agenda/Pauta que lhe são dirigidos; entrega de atualização/cancelamento como sinal de resync. Respeitar fila e idempotência; manter \`NATIVE_FCM_DELIVERY_ENABLED\` público intacto.
D3. Coordenação push versus alarme local: para mesmo evento, não notificar duas vezes; receber push de sincronização silencioso quando permitido; fallback informativo se app ficou muito tempo sem sincronizar; registrar aceitação/erro sem declarar “leu”.
D4. Deep links internos validados, abrir \`/sistema/agenda?date=YYYY-MM-DD\` e focar compromisso após sessão válida. Nunca aceitar URLs externas do payload; app fechado redireciona login e depois destino permitido.
D5. Revisar APIs/cron para rate limiting, revogação e tolerância a indisponibilidade FCM ou Supabase, sem desativar avisos públicos e sem duplicar Telegram.

### Lote E — pacote completo e homologação
E1. Interface home, Agenda/Pauta mobile, acesso pelos perfis, preferências, atualização e versão; nenhum botão decorativo/inoperante. Se uma função não existe, mostrar indisponível em vez de fingir que atualiza.
E2. Compilar/testar internamente, APK Android debug e teste em 360/390/768px, teclado, back, offline, sessão expirada, links diretos.
E3. Simular dois usuários (criação, baixa individual, reabertura, cancelamento, edit concorrente), 2 dispositivos por usuário e troca de perfil no mesmo aparelho; RLS e auditoria.
E4. Matriz 12/13/14/15, notificações negadas/concedidas, tela bloqueada, segundo plano, sistema encerrado, force-stop, reboot, DND e economia de bateria. **Force-stop geralmente impede entrega até voltar a abrir; registrar como limitação**, não prometer workaround.
E5. Preparar assinatura/keystore EXCLUSIVO, checksum SHA-256, changelog e UM APK de homologação completo; só então oferecer instalação autorizada ao proprietário. Nenhuma Play Store obrigatória.

## Configuração MANUAL por celular — procedimento de aceitação
1. Instalar **IR Controle** e fazer login com a conta individual do colaborador.
2. Abrir **Perfil → Alarmes do dispositivo** (depois de implementado); autorizar **Notificações**. No Android 13+ há prompt de autorização.
3. Em Android 12+: abrir **Configurações → Aplicativos → Acesso especial → Alarmes e lembretes → IR Controle → Permitir**, ou fluxo equivalente \`changeExactNotificationSetting\`. O nome/posição do menu pode variar por marca.
4. Conferir **Configurações → Notificações → IR Controle** e ativar o canal apropriado (“Som”, “Vibração”, “Som e vibração” ou “Silencioso”); verificar volume de notificações e modo Não Perturbe. Para tocar durante Não Perturbe, revisar EXPLICITAMENTE as exceções do próprio Android, se a política do aparelho oferecer; nunca contornar DND silenciosamente.
5. Se o fabricante limitar apps em segundo plano, configurar bateria como **Sem restrições / Não otimizar** para IR Controle, quando essa opção existir. Avaliar impacto em bateria e não pedir automação por ADB sem consentimento do responsável pelo aparelho.
6. Tocar **Testar aviso**. Bloquear a tela por pelo menos dois minutos; confirmar som, vibração e horário; consultar a tela de diagnóstico do aplicativo. Depois criar lembrete real próximo, validar e testar após reiniciar.
7. Se falhar: registrar modelo, Android, versão APK, modo configurado, canal, estado da permissão exata, horário alvo, rede e resultado; não declarar “configurado” sem repetição do teste.

### Critérios bloqueantes ("não compilar release se…")
- Login autenticado ou logout/troca de conta têm falha.
- Operador pode alterar tarefa alheia ou ler auditoria sem grant.
- Alarme local não programa ou não toca com a tela bloqueada em aparelho de teste com permissões concedidas.
- Edição/cancelamento deixa aviso obsoleto agendado após a reconciliação online.
- Dois perfis recebem avisos uns dos outros no mesmo aparelho após logout/login.
- Som/vibração no app não reflete escolha/canal do sistema, ou botão teste afirma sucesso sem entrega.
- Build do sistema ou APK falha; Firebase separado ausente e FCM apresentado como ativo; sem instrução de configuração manual.
- Nenhuma assinatura nova verificada ou pacote indistinguível do app jornal público.

## Relatório pedido após cada lote
Informar arquivos modificados, commit(s), testes executados e reais resultados, bugs corrigidos, pendências, bloqueios por credenciais/permissões, alterações locais preservadas, se migrations foram apenas preparadas ou aplicadas, se Vercel foi publicada, se APK foi compilado internamente ou ENTREGUE. Encerre cada lote com próximo conjunto de no máximo 5 itens, sem tomar ações em produção sem autorização.

## Fontes oficiais
- Android: https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- Capacitor v7: https://capacitor-site.vercel.app/docs/v7/apis/local-notifications
- Android Doze: https://developer.android.com/training/monitoring-device-state/doze-standby
