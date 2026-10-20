# IR Controle — escopo fechado para o primeiro APK realmente utilizável
Data: 20/10/2026 | Status: **PROPOSTA DE ARQUITETURA / NÃO HOMOLOGADO / NÃO COMPILAR RELEASE AINDA**

## Intenção do proprietário
Desenvolver **todas as funções necessárias do aplicativo administrativo antes de entregar um APK de testes completo**, evitando repetir o erro de compilar versões parciais do aplicativo público. Isto **não** proíbe builds internos automatizados, necessários para detectar erros: significa **uma rodada concentrada de homologação no aparelho**, seguida da assinatura e entrega de um APK release apenas quando todos os critérios abaixo forem atendidos. Não prometer ausência de correções.

## Limites do produto
- **IR Controle** é app independente do Jornal IR público. Pacote Android **com.jornalir.controle**, nome de exibição **IR Controle**; app público continua **com.jornalir**.
- Interface principal: **Capacitor 7/WebView com HTTPS controle.altnix.com.br**, Supabase Auth e RLS do portal. O site é a fonte de verdade, portanto correções web geralmente não exigem novo APK; alterações nativas (canais, FCM, permissões, assets, plugins) exigem.
- Primeiro pacote é **Android**, preparando contratos para iOS futuro, sem afirmar entrega de iPhone agora.
- **Primeira distribuição por APK assinado**, fora da Play Store, conforme fluxo já usado pelo jornal. Não reutilizar keystore, package ID, IDs de canais, dados ou tokens do app público.
- O protótipo de \`apps/mobile-sistema\` (branch \`feature/ir-controle-mobile-android-20261020\`) **SÓ cria a estrutura, abre URL e declara canais**. Nenhum alarme, push ou APK final existe ainda.

## Entrega v.00.01: UX completa e utilizável
1. **Splash e entrada**: logo administrativa específica, carregamento breve com transição suave, sem tela branca ou loop; não mascarar espera longa com animação fixa. Verificar login, sessão expirada, redefinição de senha e voltar do SSO/links (se houver). Não salvar senhas em storage personalizado.
2. **Navegação celular**: rodapé fixo com Início, Agenda, Pauta, Matérias quando permitido e Menu; respeitar safe-area e teclado; botão de voltar Android: voltar no histórico/fechar modal antes de fechar app, sem reiniciar tela ou descartar formulário.
3. **Início operacional**: resumo de compromissos do dia, minhas pendências, próximos alertas e notificações pendentes, com atalhos criar/visualizar/concluir compatíveis com permissões. Dados reais do site, nunca uma cópia nativa.
4. **Agenda/Pauta**: calendário Dia/Semana/Mês/Minha Agenda; cores estáveis, nome por extenso e status; formulário mobile de criação para gestores, edição autorizada, vários responsáveis, conclusão só da parte do próprio responsável, reabertura por gestor, detalhes recolhíveis, links diretos para matérias; sincronização Realtime e atualização quando retoma conexão.
5. **Acessos**: todos os membros ativos consultam Agenda/Pauta; proprietário e admins explicitamente delegados criam/editam/cancelam/reabrem tudo; operador apenas conclui a própria tarefa e usa módulos que lhe forem liberados. Validar **middleware e RLS**, não só menu. Corrigir regra existente que trata TODA \`/sistema/configuracoes\` como admin-only, mesmo quando operador possui concessão explícita para \`/sistema/configuracoes/auditoria\`.
6. **Perfil e Preferências**: abrir/fechar sessão, status de conexão, resumo de notificações e permissões, modo de alerta e adiantamento, botão **Testar som/vibração**, tela de ajuda para habilitar permissões nas Configurações Android. Todas as opções salvas por usuário.
7. **Offline honesto**: tela discreta de indisponibilidade; mostrar que páginas online precisam da rede. Alertas locais já programados podem tocar sem rede; não permitir concluir/alterar registros offline fingindo sucesso. Revalidar tudo ao reconectar.
8. **Atualização**: mostrar versão curta do app (ex. v.00.01), verificar versão Android disponível no backend autorizado, mostrar “Sem atualização” desabilitado caso não haja APK novo. Download/install com ação explícita, changelog e assinatura consistente; jamais instalar automaticamente nem afirmar OTA sem implementar e testar.

## Alertas de Agenda — contrato funcional
### Preferências existentes e extensões
Já existe \`public.notification_preferences\` com chave \`(profile_id,app_kind)\` e app_kind='sistema', incluindo \`agenda_enabled\`, \`sound_enabled\`, \`vibration_enabled\`. **Reutilizar**, não criar tabela concorrente de preferências gerais.
Acrescentar apenas o que faltar: antecedência padrão por usuário (opções 0/5/10/15/30/60 minutos; evento pode ter \`reminder_minutes\` próprio), aviso quando a tarefa muda, resumo de adiantamento e opção “não perturbar à noite” se a UX pedir; definir precedência do evento sobre preferência antes de codificar. Modo é derivável dos dois booleanos: som+vibração, só som, só vibração, silencioso. \`agenda_enabled=false\` desabilita lembretes por completo.
O usuário deve saber a diferença entre modo silencioso (pode exibir notificação) e desligar avisos (não agenda nada).

### Fontes e entrega
1. **Fonte de verdade: Supabase/Agenda** (\`agenda_events\`, \`agenda_event_assignees\`, preferências por \`profile_id\`). Lembretes pessoais vão apenas ao responsável ativo e que não concluiu sua parte; convidados são um tipo de evento distinto e exigem decisão explícita de envio.
2. **Agendamento local** por \`@capacitor/local-notifications@7.0.7\`: após login, no primeiro opt-in, ao abrir app, quando retoma foco, rede volta, evento muda, preferências alteram e após reboot/permissão restaurada. Manter janela limitada (ex. próximos sete dias) e limite de itens; persistir mapeamento estável \`evento/usuario/instante/versao -> notificationId int32\`; ler \`getPending()\`, cancelar obsoletos, agendar faltantes, verificar colisões, registrar ultima reconciliacao. Tratar edição/cancelamento e conclusão individual.
3. **Push FCM administrativo**: canal e configuração Firebase Android **específicos para com.jornalir.controle**, registro autenticado por \`auth.uid()\`, revogação ao logout/desativação da conta, rotação de token. Usar como sinal para reconciliar quando tarefa for criada/editada/cancelada e como entrega de servidor quando necessário, sem duplicar alerta local na mesma ocorrência. Não reaproveitar \`native_push_devices\` público: o schema atual não liga token a \`profile_id\` e a fila de notícias filtra app_kind='site'.
4. **Fila e deduplicação**: aproveitar \`notification_events\`/outbox para eventos administrativos com \`app_kind='sistema'\` somente se as rotas forem isoladas e auditáveis; registrar fila de entregas por \`device_id + event_id + due_at + revision\`, status queued/sent/failed/uncertain/superseded e \`unique\` apropriado. FCM aceito ≠ entregue/exibido/lido. Não guardar segredo, FCM token ou payload sigiloso em logs de auditoria.
5. **Toque no aviso**: abre apenas rota previamente validada \`/sistema/agenda?date=YYYY-MM-DD\` e localiza o compromisso, **depois do login/validação de acesso**, sem aceitar URL arbitrária vinda do push. Duas ações na notificação para considerar: “Abrir” (obrigatória) e “Adiar 10 min” (apenas se persistir snooze no perfil para sincronizar aparelhos); “Concluir” diretamente na tela bloqueada deve exigir autorização antes de mudar status.
6. **Canais separados no Android 8+**: som; vibração; som+vibração; silencioso; avisos gerais. IDs \`ir_controle_*_v1\`, evitar depender de som custom antes de áudio homologado. Canais são imutáveis para o app após criação: mudanças de comportamento exigem ID \`_v2\`, e o usuário pode alterar no sistema Android.
7. **Permissões**: Android 13+ \`POST_NOTIFICATIONS\` com explicação; Android 12+ \`SCHEDULE_EXACT_ALARM\` é permissão especial e muitas vezes NEGADA por padrão em Android 14+. Checar \`checkExactNotificationSetting()\` antes de agendar, oferecer acesso a configurações e fallback impreciso/FCM. NÃO usar \`USE_EXACT_ALARM\` sem avaliar política específica; NÃO tentar ignorar Não Perturbe, economizador, restrições de segundo plano, force-stop ou Espaço Privado. Alarme exato é **melhor esforço condicionado a permissões e OS**, não garantia absoluta.
8. **Som/vibração de teste**: permitir testar o canal sem alterar compromisso ou enviar push a outros, e mostrar claramente se notificação, exatidão ou canal foram bloqueados. O botão deve efetivamente gerar aviso local de teste e a pessoa confirma que ouviu/sentiu.
9. **Privacidade**: conteúdo da notificação na tela bloqueada deve ser genérico por padrão (“Você tem compromisso na Agenda”), título/detalhe opcional somente após consentimento. \`allowBackup=false\` e token FCM tratado como dado sensível; cookies/session seguem mecanismo web autenticado; nunca credenciais de serviço no APK.

### Riscos que não podemos ignorar
- O cron \`/api/cron/agenda-telegram\` atual já dispara Telegram, Web Push e push público. A nova fila administrativa não pode reativar FCM público por engano.
- O banco tem 1 perfil owner ativo no último levantamento. Testar vários responsáveis/perfis requer criar perfis de teste de forma controlada ou ambiente isolado, sem inventar equipe real.
- O canal local agendado pode soar mesmo após cancelamento remoto se o aparelho ficou offline; mitigação: mensagens genéricas, reconciliação frequente, janela curta, push de revogação e limite explícito de garantia.
- O projeto atual está em \`Capacitor 7.6.9\` e plugins \`7.0.7\`: não atualizar dependências automaticamente. Conferir versão do Gradle/Android, \`npm install\` e \`package-lock.json\` antes de compilar.
- Splash/ícones copiados provisoriamente do app público devem ser personalizados como **IR Controle**, evitando confusão entre os dois apps instalados.
- Sem Firebase separado, não se deve apresentar push real como ativo. APK debug pode ser compilado para verificações internas, mas não entregar um release parcialmente conectado.

## Pipeline para EVITAR múltiplas entregas de APK
### A. Código e backend prontos — ainda sem APK para o proprietário
A1. Finalizar páginas mobile e preferências; revisar middleware/RLS em desktop e WebView.
A2. Implementar migrations necessárias em branch; rodar dry-run SQL com rollback e testes RLS/concorrência. Não tocar Supabase remoto sem escopo aprovado.
A3. Implementar device registry autenticado, API de sincronização e jobs FCM/alertas locais. Feature flags OFF até validação.
A4. Implementar Web↔Capacitor bridge, abertura profunda, tratamento de sessão e logout; cancelar alertas no logout e agendar no novo perfil, sem misturar aparelhos.
A5. Implementar tela atualização, tela de teste de alerta, e indicadores de permissão/serviço.
A6. Completar marca/ícones/splash e assets de notificação (únicos), manifest, package id, versão e keystore exclusivos.

### B. Validação antes de distribuir APK
B1. Typecheck site/sistema, build do sistema, inspeção de imports e lockfile, revisão estática Android.
B2. Executar Gradle/Capacitor build no ambiente de homologação **internamente**; corrigir problemas sem pedir instalações fragmentadas. O “uma vez” se refere à entrega do pacote pronto ao usuário, não a abrir mão de builds de teste.
B3. QA com 1 owner, 1 admin com gestão, 1 admin sem, 2 operadores (um atribuído/outro não); nenhum operador consulta logs sem grant.
B4. Matriz Android 12/13/14/15, layouts 360/390/768, navegação voltar/teclado, sessão expirada, sem rede, lockscreen, app background/encerrado, reboot, DND, economia de bateria, permissão exata negada/revogação.
B5. Testar lembrete 5 min antes; cada modo de alerta; alteração de horário; cancelamento; conclusão parcial entre 2 responsáveis; logout/login diferente; push simultâneo + local (sem duplicidade perceptível); app público e administrativo instalados no mesmo celular.
B6. Testar alteração do site sem atualização APK e atualização obrigatória do código nativo apenas quando necessário.

### C. Primeira entrega concentrada
C1. Gerar/guardar novo keystore e seu backup externo; não copiar chave pública.
C2. Assinar APK **IR Controle v.00.01**, conferir \`applicationId\`, \`versionCode\`, certificado e SHA-256. Exibir nome/ícone distintivos.
C3. Entregar 1 APK de homologação completo com release notes e checklist; publicar somente se aprovado e fazer rollout controlado ao pessoal do jornal.
C4. Depois da homologação real, registrar status separado: implementado / testado / entregue / instalado / funcionando. Manter ajustes web em lote para evitar redeploy excessivo.

## Operações proibidas sem nova autorização
Não executar migrações no Supabase de produção, não ativar cron/FCM, não alterar credenciais Firebase, não fazer deploy na Vercel, não publicar APK, não tocar \`apps/mobile\`/Android v.00.03, não editar VS Code local. O pedido aqui foi **estruturar o pacote completo antes de compilar**; esta especificação é um planejamento.

## Referências oficiais verificadas (20/10/2026)
- [Android — Alarmes exatos](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- [Android — Canais de notificação](https://developer.android.com/develop/ui/compose/notifications/channels?hl=pt)
- [Capacitor — Local Notifications v7](https://capacitor-site.vercel.app/docs/v7/apis/local-notifications)
- [Firebase — Tipos de mensagens FCM](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)
