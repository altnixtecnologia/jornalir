# Orientações permanentes para assistentes de código — Jornal IR

Ler, antes de qualquer edição:
- `docs/ACORDOS-E-FONTE-DA-VERDADE.md`
- `docs/STATUS-E-HANDOFF.md`
- `docs/AUDITORIA-GERAL-REQUISITOS-E-PENDENCIAS-2026-10-17.md`

Confirmar diretório, branch, HEAD, status Git; não agir na worktree/backup por engano. Preservar telas, fluxos e comportamento aprovados pelo usuário. Buscar implementação e decisões já existentes antes de alterar ou propor outra. Distinguir código pronto, testes locais, homologação real e produção.

**Método definitivo (17/10/2026):** lotes de **~3 tópicos** por vez — consultar decisões aprovadas → implementar → testar (nada anterior prejudicado) → atualizar `.md` pertinente → commit local → sincronizar GitHub só quando o conjunto estiver pronto e sem risco de deploy automático → publicar na Vercel só quando autorizado → testar no ambiente oficial. Relatar FEITO/FALTA/BLOQUEIOS, atualizar handoff com o usuário e commits.

Sem autorização explícita: nada de push, deploy Vercel, migrations remotas, segredos/`.env`, envio de mensagens, PIX, notas fiscais reais, operações destrutivas ou alterações nas pastas de referência. As branches locais podem conter trabalho não enviado ao GitHub. **Deploys Preview automáticos por commit/branch não são desejados** — ver `git.deploymentEnabled` em `apps/sistema/vercel.json`/`apps/site/vercel.json`.

Quando este arquivo for instalado em um repositório que já possua `AGENTS.md`, **preservar o existente** e integrar as novas regras, sem substituir automaticamente.
