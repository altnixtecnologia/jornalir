# Instruções permanentes — Jornal IR / Claude Code

**LEIA ANTES DE QUALQUER ANÁLISE, EDIÇÃO OU COMMIT:**

1. `docs/ACORDOS-E-FONTE-DA-VERDADE.md` (decisões do usuário, UX aprovada, limites e definição de pronto).
2. `docs/STATUS-E-HANDOFF.md` (estado dos lotes, commits locais e tarefas abertas).
3. `docs/AUDITORIA-GERAL-REQUISITOS-E-PENDENCIAS-2026-10-17.md` (varredura das conversas, critérios de aceite e pendências por módulo).

As instruções nesses documentos são obrigatórias para este projeto, mas não prevalecem sobre pedidos explícitos mais recentes do usuário. Atualize o handoff depois de cada lote e as decisões quando forem aprovadas/revisadas pelo usuário.

**Obrigatório:** antes de trabalhar, `pwd`, `git status -sb`, `git rev-parse HEAD` e identificação da pasta. Só alterar a pasta oficial `Site-sistema`; preservar backup e worktrees. Consultar implementação atual antes de fazer nova funcionalidade; nunca reverter UX aprovada silenciosamente. Entregar de cada vez até 5 itens com FEITO/FALTA/BLOQUEIOS e testes reais versus mocks.

**Proibido sem autorização explícita:** push, deploy Vercel, migrations remotas, cobrança real, WhatsApp/e-mail reais, nota fiscal real, alteração de segredos/`.env`, mudanças destrutivas, alterações nas pastas antigas ou merge aleatório de branches. Não confundir compilação com funcionalidade homologada.

Se outros arquivos `CLAUDE.md` já existirem ao instalar estas instruções, **não sobrescrevê-los**; mesclar cuidadosamente preservando regras antigas e adicionar referências aos docs.
