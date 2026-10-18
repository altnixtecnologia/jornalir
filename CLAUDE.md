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
