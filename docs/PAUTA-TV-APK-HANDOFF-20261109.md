# HANDOFF — PAUTA DA SEMANA NA TV VERTICAL / APK ANDROID

**Data:** 09/11/2026 · Projeto: Jornal Informativo Regional · Escopo web/banco preparado no GitHub.  
**Objetivo:** após aprovação e deploy do sistema web, Claude Code produzirá um **APK exclusivo e somente leitura para TV Box**. Este documento não autoriza publicação nem instala APK em dispositivo.

## 1. Endereço e acesso
- URL da página web: **`https://controle.altnix.com.br/tv/pauta`** (após publicação do código desta branch).
- Consulta a mesma Pauta do Sistema IR: quinta-feira → quarta-feira, respeitando exceções registradas para a semana. `?date=YYYY-MM-DD` seleciona a semana desejada.
- **Autenticação obrigatória:** Supabase Auth com sessão legítima e perfil ativo com módulo `pauta` leitura; middleware protege `/tv/*`. Sem acesso público e sem service role no WebView.
- Se abrir pela primeira vez sem login, `/login?next=/tv/pauta`; após autenticação, retorno ao Modo TV. Um usuário exclusivo de visualização pode ser provisionado no sistema por administrador, com a menor permissão necessária.
- A página **não permite criar, concluir ou modificar pautas**.

## 2. Adaptabilidade 9:16
- `apps/sistema/src/features/pauta-tv/PautaTvBoard.tsx` + `PautaTvBoard.module.css`.
- Ajuste dinâmico por **altura real disponível**, não por tamanho fixo de cartão.
- 4 matérias: 4 cartões ocupam a altura livre; 6: 6 cartões menores; 10: compactos. Primeiro reduz margens e detalhes; conserva legibilidade.
- Quando a quantidade excede a capacidade, divide automaticamente em grupos e alterna a cada **12 segundos** (sem scroll). O cálculo está em `tvModel.ts` e tem testes.
- Cabeçalho compacto, período editorial, totais, avanço e atualização. Cards listam título, responsáveis, pendências e estado. Na TV a página ocupa `100dvh` e oferece botão de tela cheia.
- Caso nenhum item esteja cadastrado, mostrar mensagem neutra, nunca valores fictícios.
- Realtime assina `weekly_pauta_items`, `agenda_events`, `agenda_event_assignees`, `event_coverages`, `event_coverage_members`, `event_coverage_member_transfers`, `pauta_week_overrides`; fallback de atualização a cada **60 segundos**, incluindo reconexões.

## 3. Separação Agenda × Pauta
- **Agenda**: cada colaborador designado responde com um toque `Compareci`, `Não preciso ir` ou `Não poderei ir`. Pode corrigir clicando outra resposta; o sistema grava data/autor e mostra a opção escolhida.
- **Pauta**: cada entrega de campo (fotografia, vídeo, entrevistas...) tem responsável e conclusão independente; a matéria tem **um único redator**. Participação concluída não conclui entrega.
- A Agenda é considerada resolvida quando todos os escalados responderam. A Pauta só fica concluída quando todas as entregas de campo e a matéria estiverem prontas.
- Transferências com registro e **aceite**: de fotos/vídeo (campo), da matéria ou de ambas. O titular anterior mantém a responsabilidade até aceite. Gestor autorizado pode efetivar diretamente.
- Atribuições novas avisam individualmente todos os escalados; lembretes sonoro/silencioso são destinados a cada pessoa de campo, não apenas ao primeiro escalado; o envio valida titularidade/revisão no momento da entrega.

## 4. Componentes e migration
- Página: `apps/sistema/src/app/tv/pauta/page.tsx`
- Visão: `apps/sistema/src/features/pauta-tv/{PautaTvBoard.tsx,PautaTvBoard.module.css,tvModel.ts}`
- Agenda/Pauta: `apps/sistema/src/features/agenda/{AgendaWorkspace.tsx,agendaData.ts,agendaTypes.ts,actions.ts}`
- Notificações: `apps/sistema/src/app/api/cron/push/route.ts`, `apps/sistema/src/lib/notifications/coverageReminderPolicy.ts`
- Novo banco: **`supabase/migrations/20261122290000_coverage_team_agenda_pauta.sql`**. Contém equipe, transferências, RPCs, RLS, triggers de auditoria e Realtime, com compatibilidade das coberturas legadas. **NÃO aplicar automaticamente na produção no trabalho do APK.**
- Não reconstruir essas funcionalidades no APK. O APK deve **exibir a URL segura** e permitir recuperação de rede e autenticação.

## 5. Contrato do futuro APK (Claude Code)
1. Projeto Android independente do player de LED e do app de colaboradores; pacote único de TV a escolher antes de instalar.
2. Orientação **portrait 9:16**, modo imersivo/kiosk, sem barra de navegação, sem teclado ao exibir o painel.
3. WebView seguro HTTPS, cookies e storage de sessão compatíveis com Supabase Auth; sem chave secreta, service-role, credencial hardcoded ou publicação do token da sessão nos logs.
4. Ao iniciar, abrir `https://controle.altnix.com.br/tv/pauta`; se sessão expirou, permitir login na própria tela. Não tentar contornar autenticação.
5. Manter tela ativa somente durante o uso configurado, reconectar após queda de internet, permitir retorno ao painel sem perda da semana selecionada e prever desligamento/saída administrativa controlada.
6. Se a TV estiver em resolução 1920×1080 com sinal horizontal, testar rotação lógica e escalonamento para exibição **vertical**, sem esticar texto ou distorcer.
7. Verificar no dispositivo real: 4, 6, 10 e 20 pautas; títulos longos; mudança de status em outro celular; sem login/sem internet; expiração de sessão; alternância automática sem rolagem.
8. **Não publicar APK, mexer em TV Boxes, nem alterar deploy ou projeto Supabase sem autorização adicional.**

## 6. Verificações e estado de liberação
- Teste do cálculo de altura: `apps/sistema/test/pauta-tv-layout.test.ts`.
- Workflow `Cobertura de eventos - testes e tipos` verifica testes e TypeScript da aplicação. Acompanhar resultado da PR.
- Ensaio `BEGIN/ROLLBACK` da migration e do fluxo com três perfis passou no Supabase oficial, **sem persistir alterações**: criação de uma única Pauta, avisos individuais, três respostas, separação Agenda/Pauta, transferência com aceite, conclusão de matéria e duas entregas, limpeza confirmada por rollback.
- Antes do APK: revisar/mesclar PR, aplicar migration em janela controlada, publicar web no Vercel e fazer homologação do login, visual 9:16 e Realtime.
- Preservar stashes e worktrees locais do VS Code; sincronizar com `git fetch` e integração segura, **sem reset forçado**.

**Importante:** nenhum APK foi gerado nesta etapa. O código web está no GitHub; a publicação oficial e a instalação do aplicativo serão etapas explícitas posteriores.

## 7. Situação consolidada após integração (09/11/2026)

- **PR #27 integrada** em `solicitacoes-financeiro-contratos-irc-20261031`.
- Commit de merge: `6c66cd47833b0172974fd945a1f45b3640b2bd81`.
- GitHub Actions: `42659809744` e `42659810112` concluídos com sucesso (testes, TypeScript e Pauta).
- A migration `20261122290000` foi ensaiada no Supabase em `BEGIN/ROLLBACK`, incluindo equipe com três colaboradores, respostas, transferência e entregas independentes; **0 aplicações** no ledger do Supabase oficial na conferência final.
- **Ainda não publicado no Vercel**, sem APK e sem alteração em equipamentos. A página `/tv/pauta` só estará disponível publicamente no domínio após publicar o código compatível e aplicar a migration autorizada.
- Para a Claude: começar por `git fetch` e verificar esse commit/documento; não reconstruir a tela web. O próximo trabalho é **somente o APK de exibição**, mas a homologação da versão web deve ocorrer antes de instalar no aparelho.

