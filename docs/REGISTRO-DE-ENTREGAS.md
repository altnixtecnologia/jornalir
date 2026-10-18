# Registro de entregas — Jornal IR (agentes alternados)

Este registro e a referencia para troca de ChatGPT, Claude Code e Codex.
**Um agente por vez no mesmo projeto.** Nao repetir trabalho e nunca assumir
que a branch de producao ou a pasta local contem o ultimo desenvolvimento.

## 2026-10-18 — Sincronizacao local Claude/Codex

- Agente: Claude Code implementou; Codex verificou e sincronizou com autorizacao.
- Branch oficial: `consolidacao-local-20261016`.
- HEAD GitHub/local confirmado pelo usuario: `a3d506ad6053a4cc54fb3f0ac5b26250591435d5`.
- Commits enviados em um unico push fast-forward (origem `354e783`):
  `20d515d`, `3fa4caf`, `418f77c`, `3df9431`, `018f213`, `a3d506a`.
- Nenhum deploy Vercel; nenhuma migration remota; `main` nao alterada.
- Homenagens, relatorio semanal e vinculacao aniversariantes/clientes em codigo;
  migration `20261030100100_birthday_message_templates.sql` ainda pendente.
- Testes anteriores: relatados pelo Claude (typecheck, build e 101 testes);
  sem homologacao funcional com usuario autenticado.

## 2026-10-18 — ChatGPT — Assistente IR, primeiro lote (branch isolada)

- Base imutavel: `a3d506ad6053a4cc54fb3f0ac5b26250591435d5`.
- Branch remota de trabalho: `feature/assistente-ir-base-20261018`.
- **Nao e a branch oficial local**, nao foi integrada a `consolidacao-local-20261016`.
- Commits de codigo criados (em ordem; nao omitir na proxima sincronizacao):
  - `8d5aaf0`: migration do Assistente IR DESLIGADO por padrao, cofre de credenciais cifradas e propostas para aprovacoes futuras.
  - `ea20313`: tipos e modos por modulo.
  - `16f2e50`: cifragem server-only AES-256-GCM, leitura de configuracoes e bloqueio de chamadas por modulo.
  - `022aa98`: Server Actions exclusivas do owner, gravacao de chave cifrada e auditoria.
  - `599c7fd`: pagina de configuracao exclusiva do owner.
  - `e6b236b`: painel de provedor OpenAI/Claude, modelo, chaves, interruptor e modulos; sem campo de limite de valor obrigatorio.
  - `e864115`: entrada na pagina Configuracoes, visivel somente ao owner.
  - `00c7d0d`: gerador de homenagens usa controle central em vez das antigas variaveis BIRTHDAY_AI_*.
  - `8d738df`: comentario atualizado no provedor de mensagens.
- Commits complementares de documentacao (tambem precisam ser integrados):
  - `4cd4c5b`: criou este registro.
  - `9d54b8a`: instrucao de retomada no AGENTS.md.
  - `efd5a03`: atualizou STATUS-E-HANDOFF.md.
  - `44024dc`: instrucao de retomada no CLAUDE.md.
- **REGRA ANTI-OMISSAO:** o comando de integracao e do HEAD COMPLETO da branch feature
  (nao cherry-pick manual dos commits listados). O ultimo commit deste registro
  tambem faz parte do mesmo intervalo e deve ser incluido.
- **Migration nova PENDENTE**: `supabase/migrations/20261030100200_ai_assistant_base.sql`; NAO foi aplicada.
- **Env nova PENDENTE**: `AI_CONFIG_ENCRYPTION_KEY` (32 bytes aleatorios codificados em base64), somente no servidor;
  chave `SUPABASE_SERVICE_ROLE_KEY` existente continua necessaria para acesso ao cofre.
  As chaves OpenAI/Anthropic serao cadastradas na UI depois do rollout seguro.
- O modulo nao faz cobrancas, cancela boletos, envia mensagens, publica materias, acessa clientes autonomamente
  ou agenda tarefas. A fila de aprovacoes e somente esquema de dados/leitura; sem executor.
- Sem push na branch oficial, merge, deploy, alteracao de segredos ou migration remota.
- **Testes reais/local:** nao executados nesta etapa GitHub-only. Necessarios typecheck,
  build, verificacao RLS e testes autenticados antes de homologar e publicar.

### Procedimento de retomada no VS Code (Claude ou Codex)

1. Trabalhar SOMENTE na pasta oficial `Site-sistema`. Rodar `pwd`, `git status -sb` e `git rev-parse HEAD`.
2. Ler `CLAUDE.md`, `AGENTS.md`, `docs/ACORDOS-E-FONTE-DA-VERDADE.md`,
   `docs/STATUS-E-HANDOFF.md` e este registro.
3. Executar `git fetch origin --prune` (nao aciona Vercel, nao altera arquivos locais).
4. Conferir `origin/consolidacao-local-20261016` e
   `origin/feature/assistente-ir-base-20261018` com `git log --oneline` e `git diff --stat`.
5. **Se** `Site-sistema` estiver limpo, na branch oficial e o seu HEAD for ancestral da feature,
   integrar TODOS os commits da feature por fast-forward:
   `git merge --ff-only origin/feature/assistente-ir-base-20261018`.
   Se a branch oficial tambem avancou, ou houver mudancas locais, NAO descartar, resetar
   ou forcar: conferir os historicos e combinar integracao sem perda de trabalho.
6. Executar `npm run typecheck --workspace @ir/sistema`,
   `npm run build --workspace @ir/sistema` e testes pertinentes.
   Conferir migracoes pendentes e sequencia de aplicacao; nao aplicar em remoto sem autorizacao.
7. Registrar resultado e novo HEAD. Nao fazer push/deploy/migration remota automaticamente.

**Regra de prioridade:** manter o layout de Aniversariantes aprovado e os 44
modelos originais. Homenagens criadas por IA sao individuais e opcionais.

## 2026-10-18 — Decisão operacional do proprietário: NÃO sincronizar VS Code agora

- Durante o desenvolvimento pelo ChatGPT, as alterações ficam na branch GitHub `feature/assistente-ir-base-20261018`; **nenhuma atualização deve ser feita na pasta local `Site-sistema` neste intervalo**.
- O ChatGPT registra, a cada entrega, branch, SHA/commits, arquivos, testes, migrations e pendências neste arquivo.
- **Somente quando o usuário voltar a usar Claude Code ou Codex** será feita a sincronização no VS Code, como **primeira tarefa**, após inspecionar o estado local. Deve-se integrar o HEAD inteiro da branch de trabalho, não uma lista parcial de cherry-picks.
- A branch `consolidacao-local-20261016` continua intacta no GitHub enquanto o ChatGPT trabalha isoladamente, salvo nova autorização.
- Este registro complementa o procedimento anterior e elimina qualquer interpretação de que seria necessário sincronizar o VS Code imediatamente após cada lote do ChatGPT.
- Commits de documentação desta decisão na branch de feature: CLAUDE.md e AGENTS.md foram atualizados; a versão vigente é sempre identificada pelo HEAD remoto da branch, não por uma lista estática.
