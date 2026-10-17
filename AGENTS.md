# Orientações permanentes para assistentes de código — Jornal IR

Ler, antes de qualquer edição:
- `docs/ACORDOS-E-FONTE-DA-VERDADE.md`
- `docs/STATUS-E-HANDOFF.md`
- `docs/AUDITORIA-GERAL-REQUISITOS-E-PENDENCIAS-2026-10-17.md`

Confirmar diretório, branch, HEAD, status Git; não agir na worktree/backup por engano. Preservar telas, fluxos e comportamento aprovados pelo usuário. Buscar implementação e decisões já existentes antes de alterar ou propor outra. Distinguir código pronto, testes locais, homologação real e produção. Relatar FEITO/FALTA/BLOQUEIOS, máximo cinco itens por lote, atualizar handoff com o usuário e commits.

Sem autorização explícita: nada de push, deploy Vercel, migrations remotas, segredos/`.env`, envio de mensagens, PIX, notas fiscais reais, operações destrutivas ou alterações nas pastas de referência. As branches locais podem conter trabalho não enviado ao GitHub.

Quando este arquivo for instalado em um repositório que já possua `AGENTS.md`, **preservar o existente** e integrar as novas regras, sem substituir automaticamente.
