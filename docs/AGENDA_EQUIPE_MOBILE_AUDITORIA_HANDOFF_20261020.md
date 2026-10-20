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
