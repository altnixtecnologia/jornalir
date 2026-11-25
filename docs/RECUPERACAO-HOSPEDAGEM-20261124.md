# Recuperação de hospedagem — Jornal IR (24/11/2026)
Documento operacional, sem publicação automática. Escopo: **Portal** e **Sistema Administrativo** do Jornal IR. O Altnix Informativo tem repositório independente; a Altnix Platform fica fora.

## Evidência conferida no GitHub e na Vercel em 24/11/2026

- Repositório: `altnixtecnologia/jornalir`.
- **Branch oficial de produção dos DOIS projetos:** `solicitacoes-financeiro-contratos-irc-20261031`, HEAD em `a92f046de6b22a3794a11fbbea501d31774353d9` na conferência.
- A `main` do GitHub (`9a2ae7b0...`) é **outra linha de código** e NÃO deve ser escolhida automaticamente para a implantação.
- Projeto Vercel **`jornalir`**, endereço em uso `jornalir.vercel.app`: último deployment production READY com SHA **`63160bef2a87f575d5d583fa6296d70d6e6a910c`** (18/11), região `iad1`.
- Projeto Vercel **`jornalir-sistema`**, domínio `controle.altnix.com.br`: último deployment production READY com SHA **`a92f046de6b22a3794a11fbbea501d31774353d9`** (24/11), região `gru1`.
- READY na Vercel antiga **não garante acesso HTTP**: a equipe Hobby está bloqueada por exceder a cota de CPU e mostra pausa até 24/12/2026.
- **ALERTA DE DIFERENÇA:** o portal não rodava necessariamente o código mais recente da branch oficial; a aplicação administrativa estava mais adiantada. Implantar o HEAD da branch em ambos sem testes também introduz mudanças novas no portal.
- Projetos estão ligados ao mesmo repositório, mas são **dois deployments Next.js diferentes**:
  - Portal: root `apps/site`, workspace `@ir/site`.
  - Sistema: root `apps/sistema`, workspace `@ir/sistema`, basePath `/sistema`.
  - Há dependências de `packages/*` no monorepo npm workspaces; compilar com a estrutura completa, não copiar as pastas isoladamente.
- Na branch oficial conferida, ambos os aplicativos usam **Next.js 15.5.29** e React 19.1.10; não copiar diagnóstico antigo que cite Next 14 sem verificar o commit correspondente.
- Arquivos existentes `apps/site/vercel.json` e `apps/sistema/vercel.json` trazem `git.deploymentEnabled: false`. O bloqueio de build automático configurado no projeto antigo **não é transferido automaticamente a outra equipe**.

## Domínios e provedores

- `controle.altnix.com.br` fica no DNS de `altnix.com.br`, cuja zona é administrada pela **Cloudflare** (nameservers `joan.ns.cloudflare.com` e `viddy.ns.cloudflare.com`), não pela Vercel.
- Nenhum registro DNS deve mudar **antes** de o novo ambiente ser testado e aprovado.
- `jornalir.vercel.app` pertence à Vercel. Não é um domínio que possa ser transferido por DNS da Cloudflare. Recuperar o hostname na nova equipe depende de liberar/mover a vinculação anterior e regras da Vercel. **Não prometer** a manutenção automática desse endereço.
- O destino de produção, modelo comercial e aprovação de publicação **ainda não foram decididos/validos**; não criar conta/implantação para contornar suspensão ou limites contratuais do provedor.

## Variáveis, segredos e integrações — migração controlada

Foi conferida a **existência dos nomes de variáveis** no projeto Vercel antigo (consulta sem descriptografar segredos). A lista abaixo não é uma exportação dos valores:

**Portal — 6 variáveis Production:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `R2_EDITIONS_ENDPOINT`, `R2_EDITIONS_BUCKET`, `R2_EDITIONS_ACCESS_KEY_ID`, `R2_EDITIONS_SECRET_ACCESS_KEY`. Existem também variáveis de Preview diferentes.

**Sistema — 53 entradas de variável nos diferentes targets** (não 53 nomes únicos); incluem:
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Cloudflare R2: `R2_*`, `R2_EDITIONS_*`.
- Notificações e integrações: `RESEND_WEBHOOK_SECRET`, `PUSH_VAPID_*`, `FIREBASE_*`, `STAFF_FIREBASE_*`, `NATIVE_FCM_*`, `EDITORIAL_PUSH_MANUAL_ENABLED`.
- Fiscal: `NFSE_CERTIFICATE_MASTER_KEY`, `AI_CONFIG_ENCRYPTION_KEY` e demais credenciais existentes; **emissão bloqueada por feature flag** enquanto não houver certificado e teste prático autorizado.
- Financeiro e integrações: `ASAAS_*`, `WHATSAPP_*`, `JORNALIR_FINANCE_BRIDGE_SECRET`, `JORNALIR_FINANCE_BRIDGE_ALLOWED_CLIENT_IDS`, `CRON_SECRET`, `AGENDA_TELEGRAM_*`, `PUSH_ALLOWED_SITE_ORIGINS`.
- Copiar somente as variáveis necessárias de **Production para Production** via gerenciador seguro do provedor; não imprimir valores, usar chat, Git, arquivos públicos, logs ou env de Preview como substitutos. Validar referência de origem, escopo e formatos, não sobrescrever segredo ativo de webhook.
- Revisar Supabase Auth redirect URLs, origens CORS, callbacks, URLs de webhook/Resend/Asaas/Meta, links absolutos e políticas dos tokens se os hostnames mudarem; evitar duplicidade de webhooks.
- **Não clonar, apagar ou restaurar** a base de produção. As matérias, PDFs R2, clientes, financeiro, ledger, logs e trilhas de auditoria continuam na infraestrutura existente.

## Check de preparação e publicação (sem executar nesta etapa)

1. Confirmar com operador o provedor e plano conformes às regras; nunca assumir que um segundo Hobby contorna a cota ou permite uso comercial.
2. Conferir branch do projeto, arquivos locais/worktrees/stash e commits. Não rebasear/forçar sincronização do Claude Code local. Comparar os SHAs publicados de portal e sistema com o HEAD antes de escolher os candidatos.
3. No ambiente novo, configurar dois projetos **independentes** com Root Directory correto, branch de produção deliberada e deploy automático sob controle. Não instalar serviços extras para substituir Supabase/R2 já existentes.
4. Importar envs por canal seguro, sem expor `service_role` e tokens; manter chaves fiscais/certificados e webhooks **bloqueados para emissão** até homologação.
5. Executar `npm ci` na raiz; `npm run typecheck --workspace @ir/site`, `npm run build --workspace @ir/site`, `npm run typecheck --workspace @ir/sistema`, `npm run build --workspace @ir/sistema`. Não afirmar sucesso sem saída real dos testes. Verificar Node e configurações do projeto, não só `READY` no painel.
6. Validar: portal público, matéria publicada e histórica, PDF da edição, links, imagens, login/autorização do sistema, criação/edição de rascunho, agenda, relatórios, cobrança sem emissão real, webhook em modo controlado. **Nunca emitir NFS-e ou disparar cobranças reais em teste.**
7. Manter o endpoint anterior até testes e inventário de URLs; trocar DNS Cloudflare **apenas depois** de testar domínio provisório, SSL, autenticação, callbacks e rollback.
8. Verificar telemetria/cotas do provedor, pois passar na build não comprova economia de CPU. A nova implantação deve ter observabilidade e limite orçamentário razoável.
9. Registrar projeto, SHA de release, envs conferidas **por nome** e evidências dos testes em `docs/STATUS-E-HANDOFF.md`; nunca anotar segredos.

## Relação com Altnix Informativo

- Repositório diferente: `altnixtecnologia/altnix-informativo`, aplicativo Next.js em `dashboard-next`, domínios `painel.altnix.com.br` e `cliente.altnix.com.br`.
- PR #56 (hotfix de geolocalização) e PR #59 (economia parcial de sync) são branches draft, **não publicadas** na data desta nota. O aplicativo Android continua separado; preservar compatibilidade de APKs.
- A Altnix Platform (`app.altnix.com.br`) **não** participa da migração agora.

## Decisão operacional de 24/11/2026 — sequência das etapas

- **Agora:** deixar o candidato web do portal e sistema pronto, baseado na branch oficial `solicitacoes-financeiro-contratos-irc-20261031`, sem reescrever o trabalho local nem mudar bancos/URLs.
- **Depois:** configurar os dois aplicativos na hospedagem de destino autorizada, cada um com root correto, cópia segura dos segredos, URL provisória, smoke tests e limites de execução. A publicação e a alteração de DNS só ocorrerão mediante liberação específica.
- **Na etapa posterior:** concluir ajustes de aplicativos Android e a revisão do ambiente local Windows em conjunto com Codex/Claude. O primeiro passo será fazer inventário de espaço, builds, caches e backups; não executar remoção automática e não apagar código, stashes, chaves de assinatura, certificados, APKs oficiais ou arquivos históricos.
- **Fora desta migração:** Altnix Platform. O Altnix Informativo tem plano e PRs próprios no seu repositório. Não misturar branches nem deploys entre os projetos.
- **Regra de segurança:** não confundir preparar build, testar, publicar, trocar DNS e instalar APK. Documentar evidências distintas para cada operação.
