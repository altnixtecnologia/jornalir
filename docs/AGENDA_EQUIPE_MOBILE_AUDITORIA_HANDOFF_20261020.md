# Agenda, Pauta e auditoria — handoff (20/10/2026)

## Pedido aprovado pelo proprietário
- Todos os usuários ATIVOS visualizam TODOS os compromissos da equipe.
- Identificação por cor estável derivada do ID do responsável (sem depender de sessão ou dispositivo).
- O responsável conclui apenas sua própria participação/tarefa; se houver vários responsáveis, a Agenda só encerra após todos concluírem.
- Proprietário e administradores **explicitamente autorizados** podem criar/editar/cancelar/reabrir compromissos de terceiros e forçar uma conclusão administrativa.
- Logs acessíveis a proprietário e admins; operadores somente quando o proprietário liberar.
- Prioridade máxima de UX no mobile: visualizar, editar, criar, concluir, navegação/tap targets confortáveis, atualização ao reconectar e sem perder formulário.
- Futuro app da equipe é independente do app público e reutilizará banco e regras.

## Branch de código remoto
`feature/agenda-mobile-sync-auditoria-20261020`
Base `be3e61daaf83a4a26a0cea1b344b8f1e645bcf7e` da feature do portal.
**Não mesclar na `main` divergente nem fazer deploy.** A branch foi criada/remotamente editada pelo ChatGPT; a pasta local Site-sistema não foi tocada.

## Primeira etapa — em código, NÃO em produção
- `AgendaWorkspace.tsx`: cartões com cor determinística, pequenas marcações de cores no calendário, responsáveis com indicadores de baixa, atalhos + Novo, painéis resumidos, botões de toque no celular, detalhes e edições recolhíveis, ação de baixa individual, administrador pode concluir todos, canal Supabase Realtime com reconciliação em retorno ao app; formulário aberto adia refresh para não perder texto.
- `agendaData.ts`, `agendaTypes.ts`: leitura de `agenda_event_assignees.completed_at` e `updated_at`, necessário para progresso e controle de concorrência.
- `actions.ts`: baixa por RPC própria; status geral exclusivamente por RPC privilegiada; bloqueio otimista com `updated_at` para Agenda e Pauta.
- `UsersManager.tsx`: autorização do proprietário para que admins gerenciem Agenda/Pauta; opção independente para operadores consultarem logs. Os antigos selects Agenda/Pauta para operador saem porque a leitura é coletiva e escrever itens de terceiros não é mais liberado.
- `useAgendaPautaReadAccess.ts`: navegação da Agenda/Pauta visível para usuários ativos; `useAuditReadAccess.ts`, `MobileNav.tsx` e página de auditoria permitem atalho e leitura só para pessoas liberadas.
- `apps/sistema/src/app/globals.css`: CSS responsivo e botões acessíveis a toque, mobile-first.
- Migration nova `supabase/migrations/20261020155100_agenda_team_permissions_progress_audit.sql`: adição das baixas, grants, restrições RLS, RPCs, auditoria transacional de Agenda/Pauta e grants, e publication para Realtime. **Não foi executada no Supabase remoto**.

## Ordem OBRIGATÓRIA de verificação/homologação
1. Conferir `git status -sb`, worktrees e possíveis alterações não enviadas pela Claude ou Codex. NÃO usar reset/force/stash/descarte sem aprovação do usuário.
2. `git fetch origin`; comparar `feature/agenda-mobile-sync-auditoria-20261020` com a branch local ativa e as branches de outros agentes; integrar de modo não destrutivo, preferindo branch de teste/worktree isolado.
3. Ler esta migration; validar junto às demais migrations pendentes e execução ordenada. **Não aplicar remotamente sem autorização**, mesmo que os novos componentes dependam dela.
4. Em ambiente de teste isolado, rodar `npm ci`, `npm run typecheck --workspace @ir/sistema`, `npm run build --workspace @ir/sistema`, revisar possíveis erros TypeScript, SQL e RLS.
5. E2E com contas owner/admin autorizado/admin não autorizado/operador com tarefa/operador sem tarefa/operador com e sem permissão de logs. Verificar que ninguém altera pendência alheia, que baixa por pessoa não fecha a tarefa coletiva prematuramente, e que admin pode reabrir.
6. Testar duas sessões simultâneas, edição conflitante, sinal fraco/reconexão, mobile 360px/390px/768px, tela e rolagem de formulários. Testar leitura das mudanças por Realtime e revalidação no foco.
7. Só planejar implantação controlada quando E2E e rollback estiverem definidos. Não publicar no sistema ou site sem pedido explícito.

## Ainda pendente — não declarar como pronto
- **Unificação completa Pauta ↔ Agenda**: a Pauta permanece com registros independentes e campo manual de vínculo nesta primeira etapa; migrar para uma única origem e sincronizar título, data, responsaveis e baixa. Não apagar pautas antigas. Novo cadastro de Pauta deve passar a criar evento associado automaticamente, de forma transacional.
- **Auditoria global de TODOS os demais módulos do controle.altnix.com.br**: esta etapa cobre apenas Agenda, Pauta e grants. Mapear tabelas e operações servidor/banco, com redaction de segredos, testes de integridade/imutabilidade e permissão de leitura. Não afirmar cobertura universal antes disso.
- **Cores únicas configuráveis**: primeira etapa usa cor determinística por ID; se duas cores ficarem muito parecidas, evoluir para alocação persistida com unicidade e contraste.
- Lembretes pessoais, confirmação de recebimento, vibração e app administrativo independente; completar com homologação de notificação em dispositivo.
- Nenhum build/teste E2E foi executado nesta sessão remota; Vercel produção, Supabase produção e Android não foram alterados.


## Segunda etapa nesta mesma branch (20/10/2026, após retorno da Claude)

A Claude sincronizou a primeira etapa até `b53bb06` em checkout isolado, preservou branch Android v.00.03 e stash. Reportou `npm install` OK, typecheck @ir/sistema e @ir/site OK e build @ir/sistema OK. **Esses testes NÃO incluem o segundo lote abaixo**, que recebeu novos commits GitHub DEPOIS do relatório.

### O que foi acrescentado em código remoto
- Nova migration `supabase/migrations/20261020162000_agenda_pauta_unified_source.sql`, executável **SOMENTE DEPOIS** da `20261020155100_agenda_team_permissions_progress_audit.sql`. **Nenhuma foi aplicada ao banco remoto.**
- `agenda_events.event_kind` identifica pautas editoriais; toda pauta tem `agenda_event_id` obrigatório. Registros antigos sem vínculo são migrados para Agenda sem exclusão de IDs, vínculos de matérias ou timestamps editoriais; títulos acima de 180 bloqueiam a migração em vez de sofrer truncamento silencioso.
- `weekly_pauta_items` continua com `article_id`, `sort_order` e IDs históricos; os campos que se repetem são **snapshots de compatibilidade**, atualizados automaticamente por trigger a partir da Agenda (fonte de verdade).
- RPCs com transações: `create_editorial_pauta_event`, `update_editorial_pauta_event` (verifica `updated_at`), `add_agenda_event_to_pauta`. Múltiplos responsáveis são recebidos em array e tratados em `agenda_event_assignees`.
- Conclusão/reabertura de Pauta utiliza a MESMA situação/baixa de Agenda via `complete_my_agenda_assignment` e `set_agenda_status_managed`; não há duas conclusões concorrentes.
- Interface: **remove o seletor “Vincular à agenda”**, exige dia e cria automaticamente na Agenda; criação e edição com múltiplos responsáveis; cartões mostram cores, marcações individuais e avanço; botão “Incluir na Pauta” só aparece para compromissos gerais.
- Ações e tipos da Pauta passam a ler dados de Agenda como autoridade. Protegido o atalho “Criar matéria desta pauta” para operadores com módulo editorial habilitado, mesmo sem poder administrativo sobre Agenda.
- Acesso de operador autorizado aos logs também aparece no menu desktop (além do mobile).

### Testes OBRIGATÓRIOS antes de migrar ou publicar
- Nova rodada de `npm run typecheck --workspace @ir/sistema`, `npm run typecheck --workspace @ir/site`, `npm run build --workspace @ir/sistema`. Testes anteriores da Claude cobriam somente o lote 1.
- Exercitar migrations **ambas em sequência** num banco de testes isolado; simular pautas pré-existentes independentes, vinculadas, canceladas, concluídas e com matéria vinculada; verificar backfill preservando `id`, `article_id` e histórico.
- Duas sessões diferentes: criar, editar e concluir individualmente com 2+ responsáveis; confirmar que o segundo usuário não sobrescreve edição do primeiro; verificar status idêntico na Agenda e na Pauta.
- Validar permissão de owner, admin liberado/não liberado, operador responsável/não responsável, operador editorial com direito de iniciar matéria, operador com e sem auditoria.
- Mobile 360px, 390px e 768px; edição/cadastro, rolagem, tap targets, reconexão, cor fixa de todos.
- Conferir que o cron de lembretes Telegram continua lendo a Agenda e que pautas com horário sem `reminder_minutes` não geram notificações não solicitadas.
- Identificar e corrigir eventuais falhas SQL e TypeScript ANTES de qualquer deploy/migration de produção. Não confundir revisão estática remota com validação real.

### Ainda não entregue
Auditoria transversal de **todos** os módulos do Controle Altnix, notificações/despertador pessoais/vibração, app da equipe separado e homologação real. A migração global de auditoria exige inventário de tabelas e serviços para evitar vazamento de CPF, tokens ou dados financeiros nos snapshots. Nenhum deploy/migration Supabase na produção foi autorizado ou executado neste lote.

### Sincronização da Claude após o segundo lote
Claude Code está com HEAD local da primeira etapa `b53bb06`; quando o usuário decidir retomar, `git status -sb`, `git fetch origin`, comparar branch `feature/agenda-mobile-sync-auditoria-20261020` e trazer TODOS os novos commits preservando branch de Android e stash; apenas fast-forward se limpeza e ancestralidade confirmadas, senão worktree/merge revisado. Nenhum reset/force. Não fazer push adicional, preview/deploy, migration remota ou mudanças Android sem autorização.
