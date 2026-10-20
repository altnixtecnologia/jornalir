# Instruções permanentes — Jornal IR / Claude Code

**LEIA ANTES DE QUALQUER ANÁLISE, EDIÇÃO OU COMMIT:**

1. `docs/ACORDOS-E-FONTE-DA-VERDADE.md` (decisões do usuário, UX aprovada, limites e definição de pronto).
2. `docs/STATUS-E-HANDOFF.md` (estado dos lotes, commits locais e tarefas abertas).
3. `docs/AUDITORIA-GERAL-REQUISITOS-E-PENDENCIAS-2026-10-17.md` (varredura das conversas, critérios de aceite e pendências por módulo).

As instruções nesses documentos são obrigatórias para este projeto, mas não prevalecem sobre pedidos explícitos mais recentes do usuário. Atualize o handoff depois de cada lote e as decisões quando forem aprovadas/revisadas pelo usuário.

**Obrigatório:** antes de trabalhar, `pwd`, `git status -sb`, `git rev-parse HEAD` e identificação da pasta. Só alterar a pasta oficial `Site-sistema`; preservar backup e worktrees. Consultar implementação atual antes de fazer nova funcionalidade; nunca reverter UX aprovada silenciosamente.

**Método definitivo de trabalho (registrado em 17/10/2026)** — lotes de **~3 tópicos coerentes** por vez, sempre nesta ordem:
1. Consultar decisões/funcionalidades aprovadas (docs listados acima).
2. Implementar os ~3 tópicos localmente.
3. Testar e conferir que nada anterior foi prejudicado.
4. Atualizar a documentação `.md` pertinente (`STATUS-E-HANDOFF.md` sempre; `ACORDOS-E-FONTE-DA-VERDADE.md` só se uma decisão mudou).
5. Fazer commit(s) locais.
6. Sincronizar com o GitHub (`git push`) somente quando o conjunto estiver pronto **e** confirmado que não dispara Preview/produção automático.
7. Publicar na Vercel somente quando autorizado explicitamente (deploy manual/controlado).
8. Testar as funcionalidades no ambiente oficial após a publicação.
Entregar de cada vez FEITO/FALTA/BLOQUEIOS e testes reais versus mocks.

**Proibido sem autorização explícita:** push, deploy Vercel, migrations remotas, cobrança real, WhatsApp/e-mail reais, nota fiscal real, alteração de segredos/`.env`, mudanças destrutivas, alterações nas pastas antigas ou merge aleatório de branches. Não confundir compilação com funcionalidade homologada. **Deploys Preview automáticos por commit/branch não são desejados** — ver `apps/sistema/vercel.json`/`apps/site/vercel.json` (`git.deploymentEnabled`) e a seção de deploy em `docs/ACORDOS-E-FONTE-DA-VERDADE.md`.

Se outros arquivos `CLAUDE.md` já existirem ao instalar estas instruções, **não sobrescrevê-los**; mesclar cuidadosamente preservando regras antigas e adicionar referências aos docs.

## Alternância de agentes — Assistente IR (18/10/2026)

Antes de iniciar novo lote, ler também `docs/REGISTRO-DE-ENTREGAS.md`, fazer `git fetch origin` e conferir a branch `feature/assistente-ir-base-20261018`. A branch oficial local NÃO recebe automaticamente os commits do ChatGPT; integrar TODOS os commits da feature por fast-forward apenas com worktree limpa e histórico compatível. Um agente por vez no projeto, nunca dois operadores escrevendo simultaneamente. Não fazer deploy, migration remota ou alteração de segredos sem autorização.

## REGRA APROVADA — sincronizar o VS Code SOMENTE ao voltar a usar Claude/Codex (18/10/2026)

Enquanto o ChatGPT estiver trabalhando diretamente no GitHub, **NÃO pedir nem realizar sincronização do VS Code/OneDrive a cada commit**. Ele trabalha somente em branch própria e registra TODOS os commits e pendências em `docs/REGISTRO-DE-ENTREGAS.md`. A pasta local `Site-sistema` permanece intocada nesse período.

**Somente quando o usuário decidir iniciar nova sessão do Claude Code ou Codex**, a PRIMEIRA tarefa do agente será conferir os arquivos e o Git local, fazer `git fetch origin`, ler o registro de entregas, e então incorporar a totalidade da branch do ChatGPT de forma segura (fast-forward quando cabível). Verificar conflitos, testar e registrar novo HEAD. Nunca sincronizar parcialmente, nunca descartar mudanças locais, nunca fazer deploy automático. A sincronização local não é pré-requisito para o ChatGPT continuar programando no GitHub.


## Handoff remoto pendente — Agenda/Pauta (20/10/2026)
Na **próxima sessão local do Claude Code/Codex**, ler `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md` e buscar a branch remota `feature/agenda-mobile-sync-auditoria-20261020`. Primeiro verificar `pwd`, `git status -sb`, branch, HEAD e worktrees; preservar alterações locais e as branches dos outros agentes. Não integrar parcialmente nem sobrescrever; não fazer migrations remotas, push adicional ou Vercel deploy sem autorização. O usuário exige atualização local somente ao voltar a usar Claude/Codex. O ChatGPT **não** atualizou a pasta local.


## Novo lote remoto depois do seu relatório (20/10/2026)
A Claude validou a **primeira etapa** da Agenda em checkout local isolado no HEAD `b53bb06`. O ChatGPT fez depois a **segunda etapa** de unificação Agenda↔Pauta na mesma branch remota, com nova migration `20261020204121_agenda_pauta_unified_source_20261020.sql` (a primeira migration `20261020155100...` permanece pendente). Ao retomar Claude/Codex, executar fetch e ler `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`; os testes anteriores não homologam a segunda etapa. Preservar os 4 commits Android e stash; não aplicar migrations remotas ou fazer Vercel deploy sem pedido expresso.

## 20/10/2026 — AGENDA E PAUTA PUBLICADAS: ESTADO FINAL CONFIRMADO
A versão de sistema da Agenda/Pauta foi publicada na Vercel PRODUCTION, deployment `dpl_7BZUuoRTtNr7xDZ5uS3tjvYPwLgY`, commit de código `46c0f17595f4404f9874a6b1a9fbb518b74730b9`, status READY, domínio `controle.altnix.com.br` confirmado. Staging READY `dpl_2PoV84isbHBgpqQuXkWjemzseMgK` do mesmo commit. Três migrations foram APLICADAS com sucesso no projeto Supabase `site-system-ir` na seguinte ordem e com as versões reais do ledger: `20261020204050_agenda_team_permissions_progress_audit_20261020`, `20261020204121_agenda_pauta_unified_source_20261020`, `20261020204306_agenda_internal_trigger_exec_hardening_20261020`. Os arquivos SQL do GitHub foram renomeados para os mesmos nomes/versões reais neste commit para evitar reexecução inadvertida. NUNCA reaplicar estes SQLs no projeto remoto; conferir sempre o ledger primeiro. A primeira e segunda migrations foram também verificadas juntas em transação com ROLLBACK, com testes reversíveis de criação de pauta, conclusão individual, reabertura, edição, sincronização e auditoria; dados de teste não persistiram. A produção tinha 0 pautas/0 agendas antes da publicação e manteve 0 ao fim das migrations. Realtime habilitado nas 3 tabelas. Execução direta das três funções de trigger foi revogada para `anon` e `authenticated`, verificado por `has_function_privilege`. Build Next.js e TypeScript aprovados no staging e produção. Sem testes com múltiplos usuários ou celulares reais autenticados. Claude deve FAZER FETCH da branch para incorporar renomeação e documentação e preservar a branch Android v.00.03 e stash; não executar migration/deploy adicionais sem autorização. Auditoria de todos os módulos, notificações pessoais e app administrativo ainda pendentes.


## 20/10/2026 — Novo app administrativo IR Controle (fundação Android)
- Criada branch isolada \`feature/ir-controle-mobile-android-20261020\` derivada da branch já publicada da Agenda. Código inicial em \`apps/mobile-sistema\`, applicationId \`com.jornalir.controle\`, appName \`IR Controle\`. App público \`apps/mobile\` (\`com.jornalir\`) intocado.
- Capacitor 7 abre HTTPS \`controle.altnix.com.br\` na WebView, sem cópia de código da interface ou banco. Java Application cria cinco canais nativos distintos de alerta interno/Agenda: som, vibração, ambos e silencioso.
- Permissões de notificação Android 13+ e capacidade de solicitar alarme exato Android 12+ declaradas, mas nem permissão foi solicitada ao usuário nem horário foi agendado; respeitar DND e política Android/Google Play. Backup desativado para área administrativa. Ícones provisoriamente iguais ao jornal, com etiqueta distinta.
- **Primeira etapa SOMENTE de estrutura:** SEM APK compilado, SEM FCM da equipe, SEM envio/recebimento de avisos, SEM agendamento local funcional, SEM app instalado/distribuído, SEM mudança Supabase/Vercel. Não declarar lembretes funcionando.
- Próximas tarefas: sincronização local não destrutiva com Claude/Codex quando retomada; npm install/lockfile, cap sync, debug APK, Firebase Android app **próprio**, login por WebView, preferências individuais som/vibração/ambos/silêncio, push por usuário ativo, alarmes locais sincronizados e deduplicados, QA Android fechado/reiniciado/offline. Ver \`docs/IR-CONTROLE-APP-ARQUITETURA-20261020.md\`.


## 20/10/2026 — IR Controle: NÃO compilar um APK parcial
Escopo fechado para a primeira entrega funcional em `docs/IR-CONTROLE-V001-ESCOPO-IMPLEMENTACAO-TESTES-20261020.md`.
**Pedido do proprietário:** preparar completo login, navegação, usuários/permissões, Agenda/Pauta, preferências pessoais, alarmes som/vibração/ambos/silencioso, push FCM administrativo com dispositivo autenticado, notificação local offline, edição/cancelamento, reconciliação, versão/atualização, ícone/splash próprios, permissões Android, QA e assinatura ANTES de entregar uma única compilação completa de homologação.
Não significa pular builds internos/QA; significa não distribuir versões vazias para testar fragmentos.
A base Android já está na `feature/ir-controle-mobile-android-20261020`, mas os alarmes e FCM **não estão implementados**. Android público v.00.03 e stash da Claude devem ser preservados; NÃO aplicar migration/deploy da produção sem autorização. Antes de iniciar programação, ler essa especificação e a arquitetura anterior `docs/IR-CONTROLE-APP-ARQUITETURA-20261020.md`. A documentação é planejamento, não prova de funcionalidade.
