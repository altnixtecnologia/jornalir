# CLAUDE CODE — CONCLUIR NFS-e NO SISTEMA ORIGINAL (25/10/2026)

## Decisão do proprietário — prioridade máxima

Concluir o módulo **NFS-e Nacional** do Informativo Regional no **projeto ORIGINAL** do Jornal IR. **NÃO criar outro app, outra hospedagem Vercel, novo portal, projeto Supabase paralelo ou ambiente de homologação separado.** O mesmo monorepo `altnixtecnologia/jornalir`, app `apps/sistema`, infraestrutura existente e domínio `controle.altnix.com.br` continuarão sendo a referência, sem mexer no domínio agora.

O módulo NÃO será usado por enquanto: **não precisamos executar testes manuais de emissão agora**, mas a implementação precisa ser tecnicamente completa, segura, revisável e automatizadamente testada. **NÃO publicar, não ativar NFS-e real e NÃO enviar NFS-e ao Sistema Nacional** nesta tarefa. Quando a implementação estiver pronta e homologada em etapa posterior, será liberada por autorização explícita. Mesmo instalado no sistema original, manter NFS-e desabilitada/oculta para uso público e ações fiscais travadas até liberar.

**CLAUDE DEVE PRIMEIRO SINCRONIZAR O CÓDIGO LOCAL NO VS CODE, ANTES DE PROGRAMAR.** Esta documentação foi preparada remotamente no GitHub por ChatGPT; **ninguém afirma que o diretório local no Windows tenha sido atualizado**.

## Passo 0 — sincronizar a pasta ORIGINAL, sem perda de dados

Pasta usada anteriormente: `C:\\Users\\caber\\OneDrive\\Altnix\\Projetos\\Informativo Regional\\Site-sistema`. Confirmar a pasta real do workspace aberto; não supor que seja esta.

1. Diagnosticar, antes de qualquer mudança: `pwd`, `git remote -v`, `git branch -vv`, `git status --porcelain=v1`, `git worktree list`, `git log --oneline --decorate -15`, `git rev-parse HEAD`, `git rev-parse origin/main` (após fetch).
2. Ler `CLAUDE.md`, `AGENTS.md` (se existirem), `docs/ACORDOS-E-FONTE-DA-VERDADE.md`, `docs/STATUS-E-HANDOFF.md`, o handoff de legados **somente como referência de segurança local**, e os documentos de NFS-e listados abaixo.
3. Rodar `git fetch --all --prune` para atualizar **referências remotas**. Isso não atualiza os arquivos locais por si só.
4. Inspecionar diferenças contra `origin/main`, `origin/feature/homologacao-integrada-ir-20261023` e `origin/fix/convite-nfse-finalizacao-20261025`. Só fazer `git pull --ff-only` na branch adequada quando working tree limpa e ancestralidade confirmada. Conservar todos os commits, arquivos locais, worktrees e mudanças que ainda não chegaram ao GitHub.
5. Se houver divergência, alterações não commitadas, conflito ou trabalho ativo, **não** usar `reset --hard`, `clean -fd`, checkout forçado, stash automático, rebase/cherry-pick automático, force-push, nem apagar arquivos. Apresentar um plano de conciliação e preservar os dados.
6. PR **#15** (`feature/homologacao-integrada-ir-20261023`) é a linha de integração recente, ainda em rascunho na fotografia de 25/10. PR **#19** (`fix/convite-nfse-finalizacao-20261025`) contém correção de convite, horário fiscal, guardas do XSD e documentação, baseada na branch da PR #15. **Não trabalhar sobre um checkout antigo nem perder as correções da #19.** Rechecar o estado atual das PRs e integrar conscientemente na linha ativa do projeto, após comparar diffs. Não mesclar diretamente na `main` nem publicar sem autorização.
7. Relatar no início: pasta usada, branch, SHA, limpeza/sujeira do working tree, refs remotas, estratégia segura para incorporar #19 e o que ficou intocado.

## Escopo técnico NFS-e — terminar no mesmo projeto, sem antecipar uso real

Arquivos de referência:
- `docs/NFSE-NACIONAL-ARQUITETURA.md` (contém textos históricos; comparar com o código vigente)
- `docs/NFSE-FINALIZACAO-20261025.md` (na branch da PR #19)
- `packages/core/src/nfse/`, `packages/types/src/nfse/`
- `apps/sistema/src/app/sistema/nfse/`, `apps/sistema/src/features/nfse/`
- `apps/sistema/src/lib/release/releasePolicy.ts` — manter `NFSE_AVAILABLE_IN_THIS_RELEASE=false` enquanto não houver aceite explícito.
- `supabase/migrations/` e testes da RLS fiscal.

Executar **por blocos fechados**, revisar cada bloco e seus testes antes de passar ao seguinte:

### Bloco A — conformidade da DPS com documentação vigente

- Consultar arquivos oficiais da NFS-e Nacional para **Produção Restrita**, especialmente o pacote de XSD anunciado em 20/10/2026 e eventuais versões posteriores oficialmente vigentes; verificar disponibilidade e regras por ambiente.
- Baixar/verificar o pacote autêntico, **registrar checksum SHA-256**, versionar os XSD e atualizar `xsd-validator.ts` para a versão real. Não alterar somente a constante nem renomear a pasta antiga para aparentar atualização.
- Adaptar builder (DPS), identificador, XML assinado, perfis de assinatura, tributação, competência, fuso e casos suportados. Validar tanto XML **não assinado** quanto **assinado** contra XSD atualizado, sem mocks de XSD. Evitar extrapolar regras fiscais do Simples/IBS/CBS.
- Não preencher automaticamente serviço, alíquotas, códigos de tributação ou regras municipais por suposição. O cadastro mestre de clientes é `public.clients`, com snapshot explícito no rascunho.

### Bloco B — integração real PREPARADA (mas ainda DESLIGADA)

- Implementar cliente da API **SEFIN Nacional** e das consultas **ADN** com `undici`/mTLS server-side, usando contrato oficial vigente, timeouts, validação de respostas, logs saneados e erros tipados.
- Validar recibo, chave, XML autorizado, respostas rejeitadas e consultas de NFS-e por chave e DPS por ID. Não confundir resultado simulado com NFS-e autorizada.
- Organizar por interfaces/provider testáveis e **gates server-side** específicos para ambiente. Em produção real, negar absolutamente chamadas enquanto não houver homologação e autorização. Não permitir que `previewMode`/flags locais sejam forçados em Vercel para criar notas simuladas com aparência real.
- Implementar consulta segura e recuperação de tentativa `uncertain`, idempotência robusta **antes** de transmitir, mutex/lease com duração e estados seguros, impedindo dupla DPS/número de nota em clique duplo, timeout ou concorrência. Não retransmitir automaticamente após falha possivelmente posterior ao envio.

### Bloco C — segurança fiscal e armazenamento

- Revisar certificado **A1 PFX/P12**: validação de senha, CNPJ prestador, validade, chave, cadeia conforme normas aplicáveis, cofre criptografado e rotação; nunca registrar senha/arquivo/chave privada em logs, banco em claro ou Git.
- Certificar separação de poderes: owner/admin com emissão/certificado/cancelamento; operador apenas o que as permissões expressamente liberarem (ex.: rascunhos). Validar RLS, Server Actions, endpoints, permissões de armazenamento e RPCs privilegiadas.
- Revisar dados auditáveis de tentativas, cancelamento (evento oficial), possíveis substituições só quando oficialmente suportadas e claramente homologadas; não apagar histórico de erros. Proteção contra cross-tenant, replay, rota pública e vazamento de PII.
- Preparar migrations de forma idempotente/revisada, mas **NÃO aplicar ao Supabase remoto ou usar clientes reais** nesta etapa sem autorização. Rodar testes locais de segurança em banco isolado quando disponíveis, sem duplicar projetos permanentes.

### Bloco D — usabilidade do módulo ORIGINAL e acabamento

- Deixar todo o percurso operacional bem integrado a `/sistema/nfse` (prestador, perfis, rascunhos, notas, consultas, cancelamento e retorno de erro), seguindo visual e navegação existentes; não criar interface paralela.
- Mostrar estados claros: rascunho, pronto **internamente**, pendências fiscais, transmissão bloqueada, homologação, autorizado, rejeitado, incerto e cancelado. Bloquear botões quando faltarem pré-requisitos; somente resposta oficial validada pode marcar 'autorizado'.
- Manter integração opcional com Financeiro, sem emissão/conta a receber/cobrança automática; nenhuma mudança involuntária nos outros módulos.
- Implementar testes automatizados: unitários, XSD real, assinatura, contratos do provider (fixtures), concorrência/idempotência, autorização/RLS, typecheck, build, revisão de segurança. **Não confundir dispensa de testes manuais agora com permissão para entregar código sem testes automatizados.**
- Documentar configurações externas **pendentes** (certificado real, parâmetros municipais oficiais, eventuais autorizações fiscais), sem inventar valores nem alegar homologação se não houve comunicação efetiva.

## Entrega e regras finais

O alvo é **código completo no mesmo repositório original**, integrado com cuidado à linha de trabalho vigente, porém **desativado para emissão real até futura decisão**. Sem novo projeto Vercel/Supabase, sem DNS novo, sem testagem manual fiscal com dados reais agora.

No fim, informar: arquivos alterados, mudanças por bloco, testes/comandos executados e falhas remanescentes, migrations preparadas/não aplicadas, blockers externos, estado de branch e SHA. **Não fazer push, merge, Vercel deploy, alterações de configurações externas ou migrations remotas sem autorização específica.** Não prometer 'perfeito/homologado' sem evidência.
