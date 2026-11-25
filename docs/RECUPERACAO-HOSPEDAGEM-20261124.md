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

## Preservação de nomes e login na Vercel (verificado em 24/11)

- A equipe antiga conectada ao ChatGPT ainda é `cristians-projects-34074cc3` (Hobby). A conta pessoal nova mostrada pelo operador é `suportealtnix-5004`, mas **não aparece no conector atual**; será preciso conectar a nova conta ou conceder acesso autorizado na etapa operacional.
- Conferidos nos deployments READY da equipe antiga os aliases `jornalir.vercel.app` (portal), `controle.altnix.com.br` (sistema), `painel.altnix.com.br` e `cliente.altnix.com.br` (Informativo).
- **Prioridade para `jornalir.vercel.app`:** estudar transferência de projeto pelo fluxo oficial Vercel (`Settings → General → Transfer Project`). A documentação oficial lista *Domains and Aliases* como transferíveis, juntamente com envs, deployments, Git link e cron. **Não garantir** que uma equipe suspensa possa transferir para outra identidade ou que o fluxo permita a equipe destino sem associação/autorização; documentação menciona método de pagamento válido no destino.
- Renomear o projeto antigo `jornalir`, apagar a conta, remover o alias ou reimportar um `jornalir` novo **não garante** preservar/liberar o `.vercel.app`, e pode derrubar a URL do portal. Não executar nenhuma dessas operações sem confirmação e plano de retorno.
- Nomes de domínios próprios `*.altnix.com.br` podem ser preservados, pois o DNS está na Cloudflare, mas associação de projetos/domínios na Vercel deve ser tratada de forma controlada. Não alterar DNS antes da homologação.
- Fluxo de login: a autorização atual do conector Vercel do ChatGPT é vinculada à equipe antiga. A nova conta precisa ser autorizada pelo usuário no app/plugin Vercel; login em outra aba do navegador não muda automaticamente a conexão do plugin. **Não pedir senha ou token de Vercel pelo chat.**
- Consulte https://vercel.com/docs/projects/transferring-projects e https://vercel.com/docs/cli/alias.
- Respeitar o plano/licenciamento e limites de uso: não utilizar outra equipe Hobby como forma de contornar a suspensão por cota da equipe original. Para os projetos comerciais, seguir com transferência regular / suporte oficial / plano adequado conforme decisão do operador.


## Atualização operacional verificada em 25/11/2026 — migração para nova conta (sem deploy)

> **Esta seção prevalece sobre as hipóteses operacionais anteriores deste documento quando houver conflito.** O proprietário decidiu preparar três projetos novos em outra equipe Vercel, sem transferência dos projetos antigos. Este registro contém apenas metadados e nomes de variáveis, nunca seus valores secretos. Estado verificado via conectores Vercel/GitHub e Supabase; configurações que a API não permite reler estão explicitamente qualificadas.

### Decisões e limites confirmados

- Conta nova autorizada pelo operador: `suportealtnix@gmail.com`, equipe `suportealtnix-5004` (`team_ZOEjrZL5CvliWPx1SWvMYykJ`).
- A transferência dos projetos entre contas foi **descartada**. Projetos novos já existem, GitHub conectado; **não recriar**, não mudar a conexão do GitHub e não repetir o fluxo de transferência.
- Migrar **Production somente**. Ignorar variáveis exclusivas de Preview; as que estavam nos dois targets foram cadastradas apenas em Production na nova conta.
- O proprietário vai inserir os segredos restantes diretamente na Vercel. Nunca pedir que cole chaves no chat, GitHub ou logs; não usar valores falsos.
- **Não executar deploy, build na Vercel, migração SQL, troca de DNS, ativação de cobrança/NFS-e, envio externo, alteração R2 ou mudança de domínio antes dos testes e da liberação.** Os serviços antigos permanecem inalterados.
- A nova equipe está em plano **Hobby**. Validar condições de uso, limites e consumo real antes da operação comercial; não assumir que outra conta elimina a suspensão/cota anterior.

### Inventário da nova Vercel

| Projeto novo | ID Vercel | GitHub/branch correta | Root Directory solicitado à API | Production: preenchidas/total | Valores ainda vazios |
| --- | --- | --- | --- | --- | --- |
| `jornalir` | `prj_wtPXmg99fnQXUeu49HsPaBZZiKHV` | `altnixtecnologia/jornalir` — `solicitacoes-financeiro-contratos-irc-20261031` | `apps/site` | 3/6 | 3 |
| `jornalir-sistema` | `prj_feFmo15MHIg709l6QFW27LLnJhpU` | Mesmo repositório e branch oficial | `apps/sistema` | 25/40 | 15 |
| `altnix-informativo` | `prj_HLZnpRNtpP0ynBMCWS6sCULPDcwR` | `altnixtecnologia/altnix-informativo` — `main` | `dashboard-next` | 5/20 | 15 |

- Totais: **66 entradas Production cadastradas, 33 com valores reais/identificados, 33 com valor vazio**. Inicialmente, 31 entradas já estavam presentes; foram criadas 35 variáveis Sensitive vazias. Em seguida, `R2_EDITIONS_BUCKET=jornal-ir-edicoes` foi preenchida em portal e sistema, reduzindo as pendências de 35 para 33.
- O valor de `R2_EDITIONS_BUCKET` veio da documentação oficial: bucket privado `jornal-ir-edicoes`, **segunda conta Cloudflare**, independente da conta de imagens.
- Nenhuma variável existente foi substituída além dos dois campos de bucket recém-criados.
- No portal, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` foram comparadas com a conta antiga e coincidem. URL do Supabase: `https://iqnzrpdccecgalqboeyf.supabase.co`.
- No sistema, as **24 variáveis Production que já existiam** foram comparadas com a conta antiga, sem divergências detectadas (incluindo Supabase, R2 de imagens e ponte financeira). Não expor seus valores.
- No Informativo, `JORNALIR_FINANCE_BRIDGE_SECRET` e `PLATFORM_PUBLIC_API_BASE_URL` coincidem com a conta antiga. As outras 3 entradas preexistentes são Sensitive e **não são recuperáveis para conferência via API**; marcar para validação operacional, não presumir igualdade.
- As 33 variáveis vazias têm comentário `PENDENTE` nas configurações de cada projeto. A Vercel aceitou a criação de `Sensitive` vazia e edição posterior por ID. Preencher na UI/gestor de segredos antes de publicar.
- Raízes, `sourceFilesOutsideRootDirectory=true` (nos dois workspaces) e `previewDeploymentsDisabled=true` (nos três projetos) foram **enviados e aceitos** pela API, mas o retorno de consulta do conector **não expõe esses campos para confirmação independente**; verificar na tela **Settings → Build and Deployment** antes do primeiro deploy.
- **Branch de produção Vercel ainda não foi verificada/configurada pelo conector.** É obrigatório conferir no painel: ambos Jornal IR na branch `solicitacoes-financeiro-contratos-irc-20261031` (nunca usar `main` divergente); Informativo em `main`.
- Os três `vercel.json` existentes já possuem `git.deploymentEnabled: false`. O Informativo mantém os crons existentes, sem criar um novo.
- Consulta da nova equipe: **0 deployments**; os projetos novos ainda não têm domínios associados. Os domínios reais continuam ligados aos projetos da conta antiga.

### Pendências de variáveis por projeto — nomes apenas

- Portal (3): `R2_EDITIONS_ENDPOINT`, `R2_EDITIONS_ACCESS_KEY_ID`, `R2_EDITIONS_SECRET_ACCESS_KEY`. **Token R2 somente leitura**, restrito ao bucket de edições.
- Sistema (15): `RESEND_WEBHOOK_SECRET`, `R2_EDITIONS_ENDPOINT`, `R2_EDITIONS_ACCESS_KEY_ID`, `R2_EDITIONS_SECRET_ACCESS_KEY`, `STAFF_FIREBASE_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY`, `AI_CONFIG_ENCRYPTION_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `CRON_SECRET`, `AGENDA_TELEGRAM_GROUP_CHAT_ID`, `AGENDA_TELEGRAM_BOT_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ASAAS_API_KEY_PRODUCTION`, `ASAAS_WEBHOOK_TOKEN`. **Token R2 administrativo** com permissões apropriadas, separado da leitura do portal.
- Informativo (15): `BUNNY_STREAM_CDN_HOST`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `CLOUDCONVERT_API_KEY`, `PLATFORM_SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV`, `ASAAS_API_KEY`, `RESEND_API_KEY`, `CLIENT_DELETION_CODE_SECRET`, `CRON_SECRET`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_API_BASE_URL`.
- Restaurar `AI_CONFIG_ENCRYPTION_KEY` **idêntica à original** se existirem dados criptografados; não gerar chave diferente às cegas. `PUSH_VAPID_PRIVATE_KEY` deve corresponder à pública preservada. Chaves Firebase e segredos de webhook precisam corresponder às identidades/configurações reais dos provedores. `ASAAS_ENV` e `NEXT_PUBLIC_API_BASE_URL` são parâmetros, não necessariamente chaves secretas: usar valores reais, sem deduzir de exemplos.

### Código e testes verificados

- Jornal IR oficial HEAD `81b9fb056c0e16becd56fdb3329ee11731b09d2e` após merge PR #138. O workflow de hospedagem do candidato da PR #138, SHA `72555cdc55865d245718169c87ebb73e3ea64802`, concluiu **success** com `npm ci`, TypeScript e build Next.js 15.5.29 dos dois workspaces — **sem deploy**. Não confundir esse sucesso de CI com build na Vercel, teste HTTP ou validação de produção.
- Informativo `main` HEAD `5d3a8fe9fee41bbaa25547e4aacdc89928115771`, merge PR #62; cinco workflows da PR #62 no SHA `4821aac3a0120d05d3505517da90d66634dc5693` concluíram **success**, cobrindo Next 15, PWA, substituição de mídia e testes relacionados — sem deploy.
- As PRs #56 (correção de geolocalização) e #59 (redução de chamadas de contagem e sincronização) **já foram incorporadas** à `main` do Informativo em 25/11/2026. Não tentar reaplicar nem mesclar novamente. A redução real de CPU só pode ser comprovada com telemetria após publicar.
- Os três arquivos `vercel.json` foram inspecionados e impedem deployments automáticos. Os dois projetos do Jornal IR continuam com workspaces npm na raiz e `packages/*`; não construir cópias isoladas.
- Em `apps/sistema/src/lib/auth/staffAuthRedirect.ts`, o callback de convite em produção tem fallback seguro `https://controle.altnix.com.br`; ausência de `NEXT_PUBLIC_SISTEMA_URL` não aponta para localhost em produção. Não criar variável extra sem necessidade.
- No Informativo, os crons `/api/internal/billing/reconcile` e `/api/internal/media/expire` são protegidos e rejeitam requisição sem `CRON_SECRET`; manter o segredo antes de liberar.
- **Nenhuma alteração de código, migrations ou banco nesta etapa**, pois não foi identificado defeito novo que justifique mudança sem testes adicionais.

### Sequência obrigatória antes de liberar produção

1. Operador preenche os **33 valores pendentes** em Production na Vercel (sem compartilhar segredos no chat) e valida as 3 Sensitive preexistentes não legíveis do Informativo.
2. Conferir branch de produção, Root Directory e workspaces, proteção de Preview, Node.js e crons no dashboard.
3. Fazer primeiro deploy **controlado e deliberadamente autorizado**, com URL provisória, sem trocar DNS ou remover projetos antigos. Preservar SHA da release em cada projeto.
4. Testar HTTP e logins, R2 privado de PDFs e imagens, matérias e históricos, editor/admin e permissões, PWA/TV/cliente, sincronização/heartbeat, cron autenticado, webhooks sem envio externo real e fallback de erros. Não emitir nota fiscal, cobrar cliente, enviar WhatsApp ou manipular mídia real durante o smoke.
5. Observar invocações/duração e **Fluid Active CPU**; não assumir que os patches eliminaram o consumo elevado. Conferir limites/adequação do plano.
6. Só após aprovação e rollback preparado, planejar associação de `controle.altnix.com.br`, `painel.altnix.com.br` e `cliente.altnix.com.br`. `jornalir.vercel.app` pertence à Vercel e não se transfere por DNS; preservar o alias antigo até haver solução explicitamente aprovada.
7. Registrar evidências, commits e eventuais dificuldades em `docs/STATUS-E-HANDOFF.md`; não repetir migração inteira nem tentar transferência de contas descartada.

**Estado da rodada:** preparação de hospedagem e inventário concluídos até o limite seguro sem chaves; **deploy pendente**, nenhum domínio, SQL ou armazenamento histórico alterado.
