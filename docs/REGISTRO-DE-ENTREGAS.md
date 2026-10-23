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
  migration `20261018030124_birthday_message_templates.sql` ainda pendente.
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
- **Migration nova PENDENTE**: `supabase/migrations/20261018030210_ai_assistant_base.sql`; NAO foi aplicada.
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

## 2026-10-18 — ChatGPT, lote 2: conexão e resumo operacional (GitHub somente)

- Branch mantida: `feature/assistente-ir-base-20261018`. Branch oficial local/VS Code NAO sincronizada (decisao do proprietario).
- Commits deste lote, na ordem:
  - `00a0e5e` — funcao server-only para ler a credencial cifrada exclusivamente no teste manual do proprietario.
  - `0b0e2a7` — Server Action de teste da chave OpenAI/Anthropic; GET de modelos, timeout 10 s, auditoria de sucesso/HTTP; sem geracao de texto e sem alterar interruptor global.
  - `2fbcb8a` — tipos do resumo agregado (sem nomes/telefones/documentos).
  - `c6f8220` — action de resumo sob demanda, somente owner, com RLS do usuario; consulta Financeiro, pedidos do Site e Agenda APENAS se global/modulo ativados; zero chamadas de IA.
  - `ddb6a2e` — tela de configuracoes com botoes "Testar conexao" e "Atualizar resumo", indicadores e tratamento de erro.
  - `f5596f3` — impede apresentar dados de demonstracao como dados reais no resumo.
- **Nenhuma API foi chamada na conta do usuario; nenhum envio, cobranca, cancelamento, publicacao ou automacao**.
- **Validacao efetuada:** inspecao estatica dos arquivos e refs por GitHub connector; checagem de estrutura e dependencias por leitura.
- **NAO validado:** typecheck, Next build, testes de seguranca Supabase/RLS, uso autenticado, chaves reais, endpoints externos. O ambiente de teste isolado nao tem acesso de rede ao GitHub e nao representa VS Code. Nao afirmar que esta homologado.
- As migrations `20261018030124_birthday_message_templates.sql` e `20261018030210_ai_assistant_base.sql` seguem pendentes; nenhum remoto alterado.
- **Proxima retomada:** integrar HEAD INTEIRO da branch feature quando o usuario voltar a usar Claude ou Codex; nao cherry-pick apenas os 6 commits deste lote. Rodar typecheck/build, auditar os controles de acesso e autenticar os fluxos antes de producao.
- Melhorias futuras (NAO implementadas): agente autonomo agendado, resumos proativos, central de decisoes com aprovacao reautenticada, atendimento inteligente ao site, importacao editorial assistida por IA, historico de custo.


## 2026-10-18 — PUBLICAÇÃO AUTORIZADA (sistema administrativo)

**Autorizações:** proprietário solicitou publicação de produção e, em seguida, autorizou expressamente aplicar duas migrations e criar/configurar a chave de criptografia interna. Proprietário confirmou criação da variável no painel da Vercel.

**Banco Supabase** `site-system-ir` (`iqnzrpdccecgalqboeyf`):
- Migration `birthday_message_templates` aplicada com sucesso. Versão REAL registrada pelo Supabase: `20261018030124`.
- Migration `ai_assistant_base` aplicada com sucesso. Versão REAL registrada pelo Supabase: `20261018030210`.
- Foram verificadas a existência das tabelas e RLS. A tabela `ai_provider_credentials` não concede SELECT/INSERT/UPDATE/DELETE para o papel authenticated. O Assistente IR tem `enabled=false` inicialmente; nenhuma chave API ou aprovação cadastrada.
- Os arquivos SQL foram **renomeados sem alterar conteúdo** em commit `20295a0`, para usar as mesmas versões de migrations que o Supabase realmente registrou (evita reaplicação por divergência de nome do arquivo no futuro). Os nomes anteriores `20261030100100_...` e `20261030100200_...` não devem ser reutilizados. A versão REAL do banco, e não o comentário antigo dentro do SQL, determina se a migration foi aplicada.

**Vercel:** projeto `jornalir-sistema`, somente Production. `AI_CONFIG_ENCRYPTION_KEY` confirmada como variável do tipo Sensitive para Production; sem revelar o valor. `SUPABASE_SERVICE_ROLE_KEY` já existente, não alterada. Nenhuma variável de Asaas/WhatsApp/NFS-e modificada.
- Prévia compilada: `dpl_5VV52g4aD93nzWH4Wex1tFR8y6RX`, READY, SHA `948060c18c47158cb4e8f8f8acf2c201ef876237`.
- **Deploy de produção:** `dpl_4eLiZNh8J5JRdrBz3xjxRewbTi2c`, READY, SHA EXATO `948060c18c47158cb4e8f8f8acf2c201ef876237`, branch `feature/assistente-ir-base-20261018`.
- Domínio oficial `https://controle.altnix.com.br` confirmado por Vercel apontando exatamente ao deploy acima. Smoke HTTP de `/sistema/configuracoes/assistente-ir` chegou à página de login sem sessão, demonstrando que a proteção de login segue em vigor.
- Site público `jornalir` não recebeu deploy; VS Code, `consolidacao-local-20261016` e `main` intocados.
- **HOMOLOGAÇÃO:** build Next/TS completo na Vercel passou; testes autenticados de páginas/actions, operações no banco, chaves de API OpenAI/Claude, fluxos Aniversariantes/clientes e UX completa **ainda não ocorreram** e serão feitos pelo proprietário. Não confundir READY com homologação.
- **SHA publicado != HEAD atual da branch:** após iniciar o deploy, ajustes somente de nomes dos arquivos SQL e documentação foram registrados na feature. O código implantado corresponde a `948060c`. Quando Claude/Codex voltar a desenvolver, sincronizar HEAD INTEIRO da feature, incluindo renomeação `20295a0` e registro desta publicação.
- **Atenção:** Assistente IR continua desligado e não executa jobs automáticos, cobranças, mensagens ou decisões. O proprietário poderá cadastrar as chaves em Configurações → Assistente IR e ativar manualmente, depois de conferir o login. Consumo das APIs é cobrado separadamente das assinaturas ChatGPT/Claude.

## 2026-10-18 — Correção de navegação Assistente IR (não publicada)

- Problema observado em produção: dropdown Configurações não mostrava Assistente IR mesmo após Ctrl+Shift+F5; a entrada havia sido adicionada somente na página `/sistema/configuracoes`, não ao menu de navegação compartilhado.
- Diagnóstico confirmado no SHA publicado `948060c`: `configuracoesNavGroup` não continha o link. Banco Supabase consultado em modo leitura: o perfil do proprietário encontra-se `owner` e `active=true`; não foi necessário alterar permissões ou dados.
- Correção aplicada APENAS à branch `feature/assistente-ir-base-20261018`, mantendo os controles por papel:
  - `a10f39f`: registra link em `apps/sistema/src/lib/navigation.ts` com `ownerOnly: true`.
  - `0c04813`: filtra o dropdown desktop em `apps/sistema/src/components/admin/AdminHeader.tsx`.
  - `f31bb81`: filtra menu e busca mobile em `apps/sistema/src/components/admin/MobileNav.tsx`.
- Status: alteração somente em GitHub, NÃO publicada, NÃO sincronizada no VS Code, sem migrations, sem alteração de produção ou segredo. Inspeção estática efetuada; typecheck, build e teste funcional da nova navegação PENDENTES.
- Próximo passo: proprietário pode testar o Assistente IR JÁ PUBLICADO pelo URL direto `https://controle.altnix.com.br/sistema/configuracoes/assistente-ir`. Verificar se abre e se o cofre está disponível; cadastrar chaves somente na interface, sem compartilhar no chat. Para o menu aparecer será necessário um NOVO deploy após validação e autorização, idealmente junto de outras correções do lote.

## 2026-10-18 — Assistente IR: catálogo, cadastro de chaves e Liga/Desliga (branch somente)

- Solicitado pelo proprietário: substituir modelo digitado por seleção fixa, detectar versões novas como sugestões, liberar campo de chave que estava cinza, trocar checkbox de ativação por botão Liga/Desliga.
- Diagnóstico estático do bloqueio: input da chave era `disabled` quando `initial.encryptionAvailable=false` ou `backendAvailable=false`, independentemente da ativação do serviço. Não afirmar que o valor do segredo está correto: variável Sensitive `AI_CONFIG_ENCRYPTION_KEY` existe no target Production da Vercel, mas seu conteúdo/formato não foi lido nem exposto. `SUPABASE_SERVICE_ROLE_KEY` também consta em Production. Tabelas `ai_assistant_settings`, `ai_provider_credentials` e `ai_approval_requests` existem; contagens 1/0/0 respectivamente; políticas RLS verificadas. Não houve mutação de banco.
- Commits na `feature/assistente-ir-base-20261018`:
  - `4d659d4` — tipos, opções básicas de modelos e diagnósticos tipados.
  - `14ea7bb` — motivo seguro de indisponibilidade do cofre e de consulta ao backend (sem segredos).
  - `8cec71a` — action exclusiva do owner para consultar catálogo oficial de modelos OpenAI/Anthropic com a credencial cifrada; sem mudar seleção, gerar texto ou executar tarefas.
  - `e26cac3` — interface com seletor de modelos; consulta automática ao abrir/trocar para provedor com chave e botão para atualizar; switch Liga/Desliga com salvamento explícito; campo da chave digitável mesmo se cofre estiver indisponível, erro explicado no próprio painel. O servidor CONTINUA bloqueando o salvamento de qualquer chave se criptografia ou service role estiverem ausentes/inválidos.
- Observação: a API oferece modelos à conta, não necessariamente detecta toda novidade global. Sem alteração automática do modelo configurado. Não existem jobs periódicos para avisos proativos de lançamentos nesta etapa.
- Verificação realizada: inspeção estática dos quatro arquivos da feature via GitHub; nenhuma compilação TS/Next, teste autenticado, teste de API real, gravação de segredo ou deploy. NÃO anunciar como funcional em produção.
- Próximos passos: confirmar erro do cofre/backend na UI nova; se cofre estiver inválido, corrigir `AI_CONFIG_ENCRYPTION_KEY` no ambiente seguro sem revelar segredo (avaliar e pedir autorização antes de substituir). Executar typecheck/build e testes de owner/perfil antes de publicar em lote autorizado; registrar novo SHA e testar cadastro de chave, lista de modelos, persistência do switch e conexão. Nenhum push em branch oficial, VS Code ou produção nesta entrega.

## 2026-10-18 — Screenshot de produção: cofre desabilitado, diagnóstico sem alterar segredos

- Proprietário enviou captura da tela publicada mostrando as duas chaves não configuradas, campo de chave inacessível e aviso legado `Cofre indisponível: configure AI_CONFIG_ENCRYPTION_KEY...`.
- Diagnóstico confirmado no código publicado `948060c`: `hasAssistantEncryptionKey()` retorna false se a variável de ambiente não existir no runtime ou se, decodificada de Base64, não tiver exatamente 32 bytes. Não é causado pelo interruptor geral da IA.
- Metadados Vercel (valores de segredos NÃO consultados): `AI_CONFIG_ENCRYPTION_KEY` Sensitive presente no target Production e criada antes do deploy `dpl_4eLiZNh8J5JRdrBz3xjxRewbTi2c` READY; `SUPABASE_SERVICE_ROLE_KEY` também consta em Production. Portanto, suspeita de formato incorreto, mas não confirmada sem diagnóstico em runtime.
- Consulta somente leitura ao Supabase: `public.ai_provider_credentials` permanece com 0 registros. Nenhuma credencial cifrada depende da chave de criptografia atual.
- Orientado proprietário a gerar novo segredo de 32 bytes Base64 **localmente** (PowerShell), copiar por clipboard e substituir somente a variável `AI_CONFIG_ENCRYPTION_KEY` em Vercel Production sem colar valores em chat. O usuário ainda não confirmou execução.
- Após alteração do segredo, é necessária nova publicação para injetar a variável no runtime. NÃO fazer deploy sem autorização; preferir a próxima publicação agrupada dos ajustes do menu e UX (chave/modelos/switch).
- Nenhuma edição no banco, deploy ou segredo feita pelo agente neste diagnóstico.

## 2026-10-18 — Assistente IR: conversa com IA e leituras de módulos (em desenvolvimento, SEM produção)

- Proprietário exigiu concluir efetivamente a IA, sem confundir estrutura inicial com funcionalidade pronta. Continuação ocorre exclusivamente na branch `feature/assistente-ir-base-20261018`, mantendo pasta VS Code e branch oficial local intocadas.
- Foram criados e integrados:
  - `6fbcb4c` — `apps/sistema/src/app/sistema/assistente-ir/actions.ts`: pergunta real ao provedor configurado (OpenAI Responses / Anthropic Messages), owner autenticado e ativo, cofre no servidor, global ON e módulo ON, histórico limitado, RLS do usuário, resumos Financeiro/Site/Agenda, sem comandos de escrita; rate/timeout por chamada, extração de resposta e contagem de tokens em auditoria (sem perguntas/respostas em log).
  - `bdecf21` — `apps/sistema/src/features/configuracoes/AiAssistantChatPanel.tsx`: interface de conversa com mensagens, atalhos, erros e fontes de consulta.
  - `18e73b4` — `apps/sistema/src/app/sistema/assistente-ir/page.tsx`: página `/sistema/assistente-ir` protegida por autenticação owner.
  - `38795d5` — menu de Configurações com Conversar + Configurar para owner; desktop e mobile usam navegação compartilhada.
  - `5102e8d` — acesso à conversa a partir das Configurações.
  - `99a8c78` — botão de conversa no painel de configurações e limpeza de consulta duplicada de catálogo.
  - `62e270c` — histórico agregado de tokens nos últimos sete dias por modelo a partir de `audit_events`, filtrado por owner e RLS.
  - `e74377d` — UI de consulta de uso manual, sem histórico de perguntas no servidor.
  - `1ef6a34` — contagens agregadas adicionais de Clientes, Editorial, Aniversariantes, Contratos e Fiscal (total oito módulos). Sem nomes, CPF/CNPJ, dados de cliente ou textos internos enviados às APIs.
  - `51be8d3` — restrições no prompt para respostas ancoradas exclusivamente nos dados agregados disponíveis.
- Este é um **assistente de conversa e leitura**. Escrever em outros módulos, enviar WhatsApp, baixar PIX, publicar notícias, emitir NFS-e ou executar tarefas automaticamente **NÃO foi implementado**. A central de propostas/execução e rotinas autônomas continuam como lacunas reais. NÃO anunciar como concluídas.
- Para validar sem deploy Vercel: `be803e5` incluiu temporariamente a branch do Assistente no gatilho do workflow GitHub `validate-system.yml` (typecheck + build e smoke de contratos). Execuções iniciadas em `https://github.com/altnixtecnologia/jornalir/actions`; conferir resultado final e remover gatilho extra se causar múltiplas execuções. `apps/sistema/vercel.json` segue `git.deploymentEnabled: false`.
- Produção ainda aponta para `948060c`; alterações presentes SOMENTE no GitHub feature. Nenhuma chave de API cadastrada ou chamada real OpenAI/Claude; nenhuma mudança no banco, migrations ou configuração Vercel neste lote.
- Bloqueio em produção: `AI_CONFIG_ENCRYPTION_KEY` existe no ambiente Production mas a tela indica cofre inválido/indisponível; usuário foi orientado a gerar 32 bytes Base64 localmente e editar somente a variável, porém **ainda não confirmou execução**. Valor NÃO foi lido. Após correção, será preciso novo deploy AUTORIZADO para o runtime.
- Próximos critérios para dizer pronto: CI completo OK na versão final; conferir variável no runtime, cadastrar e testar cada API, efetuar geração real em cada provedor, testar RLS owner/não-owner, falhas de chave e saldo, selecionar modelo, habilitar módulos, conferir oito contagens e auditar consumo; somente depois autorizar publicação e homologar. Novas operações mutáveis e jobs exigem revisão separada de escopo e proteção.

## 2026-10-18 — Central de propostas do Assistente IR (branch, SEM produção)

- Estrutura da tabela `ai_approval_requests` já existe no Supabase. Sem nova migration ou escrita no banco real nesta etapa.
- `3c934f8`: actions exclusivas do owner para criar proposta manual a partir da IA em módulo habilitado, listar pendentes/histórico e aprovar/recusar em atualização condicionada ao status pendente. Usam admin server-side somente APÓS autenticar owner; auditoria sem conteúdo nem segredos.
- `edd177c`: interface de revisão de propostas com indicadores de estado, conteúdo e decisão explícita.
- `9bbe4c8`: página `/sistema/assistente-ir/propostas` protegida (owner).
- `a1e05e5`: na conversa, preparar sugestão para revisão com edição de título, texto e módulo, salvar sob clique explícito.
- `5a9fe57`: passa opções de módulos ligados da página para a conversa.
- `73e413e`: navegação owner para a central de propostas.
- Aprovar significa SOMENTE marcar conteúdo para revisão humana, **não executa** ações reais (não envia, não publica, não movimenta valores). Futuros executores devem ter contratos/guardas de permissão próprios e autorização específica.
- GitHub Actions foi acionado temporariamente por `be803e5`; várias execuções de CI disparadas por commits de código. Primeiros workflows passaram `typecheck`, `build`, testes de contratos; execuções posteriores precisam ser consultadas. Gatilho temporário da branch foi removido em `fcee156`, restaurando o workflow anterior. Nenhum deploy Vercel.
- Ponto de parada atual: aguardar CI da versão com central de propostas; corrigir eventuais erros em nova branch, e depois validar o cofre, cadastrar credenciais OpenAI/Claude e executar testes autenticados E2E antes de publicação. Rotinas automáticas/cron e executores mutáveis ainda NÃO foram implementados.

## 2026-10-18 — VERIFICAÇÃO CI DA VERSÃO FINAL DO LOTE

- Workflow GitHub Actions `Validate project`, execução `39129277867`, SHA `73e413efb826fb10f0b5584e0928dd763e3697e0`: **SUCCESS**. Inclui typecheck/build site, typecheck/build sistema, dois smoke tests de PDF/contratos. URL: `https://github.com/altnixtecnologia/jornalir/actions/runs/39129277867`.
- Falha `39129248861` foi apenas de versão intermediária (`a1e05e5`): a página ainda não passava prop `moduleChoices`. Corrigido em `5a9fe57`; últimas execuções `39129262629` e `39129277867` SUCCESS.
- Gatilho extra do CI foi retirado da branch em `fcee156`; commits posteriores somente de documentação. Não existe novo código de aplicação depois do SHA aprovado em CI.
- Comparação posterior: branch feature 34 commits à frente de `948060c`, nenhum atrás, 18 arquivos alterados. Produção continua `948060c` READY; nenhum deploy feito neste lote.
- **Limites do teste:** CI comprovou compilação e scripts citados, não credenciais reais, uso autenticado da UI, geração OpenAI/Claude nem fluxo de aprovação no Supabase. Ainda exige chave de cofre válida, cadastro de chaves, testes reais e autorização de deploy.

## 2026-10-18 — DEPLOY DE PRODUÇÃO AUTORIZADO APÓS ATUALIZAÇÃO DO COFRE

- Proprietário confirmou ter atualizado manualmente `AI_CONFIG_ENCRYPTION_KEY` via PowerShell 32 bytes em Base64 e salvado na Vercel. Metadados Vercel confirmaram `updatedAt=1792328743402`, target Production, Sensitive; **o valor secreto não foi lido e sua validade no runtime ainda requer teste autenticado**.
- Publicação única acionada pelo ChatGPT com GitSource `feature/assistente-ir-base-20261018` e SHA exato `d92625f38ec27f237c77e9eabe8486a8cd39b3c7`, projeto `jornalir-sistema`, target Production. ID: `dpl_J14nL9Khh1wdiwpuJJsP4Ku4Toio`.
- Vercel: build concluído, `READY`, domínio `controle.altnix.com.br` confirmado apontando ao mesmo deployment; `aliasError=null`. Também mantém alias `jornalir-sistema.vercel.app`. Não foi publicado o site público; nenhuma migration/alteração no banco foi realizada durante este deploy.
- CÓDIGO PUBLICADO: interface de configuração com campo de chave e diagnóstico, toggle Liga/Desliga, sugestões de modelos; conversa com IA OpenAI/Claude em `/sistema/assistente-ir`, métricas agregadas de oito módulos sujeitos a RLS, registro de tokens e propostas para revisão sem execução real; menu owner desktop/mobile.
- PRÓXIMO PASSO CONCRETO: proprietário entrar em `https://controle.altnix.com.br/sistema/configuracoes/assistente-ir`, verificar se o cofre está disponível, cadastrar a chave OpenAI/Claude somente na interface, clicar `Testar conexão`, selecionar modelo e habilitar pelo menos um módulo, salvar, testar geração na página de conversa e verificar central de propostas com sessão owner. Enviar apenas mensagens/prints sem chaves ao assistente. Caso ainda apareça cofre indisponível, inspecionar erro de runtime antes de refazer segredo.
- LIMITAÇÕES: ainda não realizado teste E2E autenticado, chamadas reais aos provedores ou homologação de rotinas autônomas e executores; o status READY certifica publicação/build, não todos os fluxos funcionais.

## 2026-10-18 — Correção feedback das APIs e agrupamento de navegação (NÃO PUBLICADO)

- Capturas do proprietário mostram OpenAI "Armazenada no cofre", catálogo com 100 modelos consultados, chave esvaziada após salvar e teste de conexão sem mensagem visível; os três links do Assistente IR estavam soltos em Configurações.
- Supabase consultado somente para diagnóstico: em `audit_events` há `key_replace` em 13:11:08Z e 13:12:17Z e testes `connection_test` OpenAI **HTTP 200/success=true** em 13:12:03Z e 13:12:22Z. A chamada de autenticação realmente funciona, mas o feedback era exibido exclusivamente no fim da página, longe do botão.
- `ai_assistant_settings.enabled=false` persistido ao verificar banco, apesar de toggle mostrar "LIGADO" na tela: a seleção não tinha sido salva pelo botão global ao fim da página. Não ativar servidor por SQL nem supor que a seleção foi gravada.
- Correção do painel `df1b1e8`: mostrar feedback persistente e acessível imediatamente sob os botões da chave/teste (aguardando, êxito, erro e horário local), capturar erros de comunicação; após salvar a chave, limpar o campo **intencionalmente por segurança** e explicar; destacar quando o toggle ou configurações estão não salvos e adicionar atalho para botão de salvar.
- Navegação `5bebcf8`, `79039ef`, `30d9d62`: unifica `Conversar`, `Propostas e aprovações` e `Configurar assistente` sob cabeçalho visual **Assistente IR** em Configurações (desktop/mobile), mantendo restrição owner. Novo nome da personalidade pública **Íris** foi apenas SUGERIDO, ainda não aprovado nem implantado. Uma futura interface pública deve ser isolada dos dados internos e permissões owner.
- CI GitHub Actions run `39131103349` SHA `833fd831`: SUCCESS em typecheck/build sistema e site, smoke PDFs/contratos. Workflow habilitado temporariamente em `833fd83` e restaurado em `f22b621`, sem alteração funcional após o commit validado.
- Situação: branch de desenvolvimento GitHub apenas. **Não publicado neste lote**, sem migrations, sem mudança de chaves, sem alteração na pasta VS Code. Próximo passo: autorizar um único deploy agrupado, verificar feedback com sessão autenticada e confirmar persistência do toggle; testar geração real com módulo assistido antes de chamar funcionalidade pronta.

## 2026-10-18 — JoIR — nome de exibição e linha compacta de provedor/modelo (branch; não publicado)

- Pedido na captura: reduzir campos `Provedor` e `Modelo do provedor` para acomodar o botão de atualização **na mesma linha** em desktop; manter adaptação mobile. Proprietário sugeriu identidade **JoIR** (Jornal + IR) para futuramente apresentar o assistente a leitores.
- `86ca1c3`: área `Provedor e modelo` reorganizada em linha flexível com seletor do provedor de até 250px, seletor do modelo de até 330px e botão curto "Atualizar modelos"; legendas/status abaixo da linha para que não desalinharem controles. `flex-wrap` mantém usabilidade em telas estreitas. Nenhuma lógica de API alterada.
- `a5c9da4`, `e666119`, `f660d0e`, `640f415`, `dc6961c`, `0a71c41`, `f76020c`, `ba6debb`: identidade visível de **JoIR** aplicada às páginas privadas e à saudação/instrução do assistente, além de título do subgrupo desktop/mobile **JoIR — Assistente Virtual**. Rotas, tabelas, permissões e segredos permanecem inalterados. O uso como persona de atendimento ao público é futuro e exige camada de dados públicos completamente separada.
- Workflow de CI da branch temporariamente ligado no commit `9baff8c`, execução `39131917195`, e restaurado em `93ece9d`, sem alterar aplicação depois do início do teste. Verificar o resultado do CI antes de marcar aprovado.
- **Ainda não publicado**: produção permanece `d92625f`. VS Code/branch oficial local não tocados. Sem migrations, chamadas à API ou alterações de credenciais.
- Próximo passo: conferir typecheck/build/CI, aguardar autorização explícita para único deploy agrupado com as correções anteriores de feedback; após publicar, testar autenticação e geração de texto em sessão owner, e confirmar nome definitivo público antes de integrá-lo ao portal.

## 2026-10-18 — CI confirmado para JoIR e campos na mesma linha

- GitHub Actions `Validate project`, execução `39131917195`, SHA `9baff8cf8af244975d5974aaf0b6458a0aa6455a`: **SUCCESS** (typecheck/build sistema e site, smoke de PDFs e contratos).
- A mudança posterior do workflow `93ece9d` apenas retirou o disparo temporário do CI e os commits posteriores são de documentação; os arquivos de aplicação permanecem os validados.
- Link de evidência: `https://github.com/altnixtecnologia/jornalir/actions/runs/39131917195`.
- Resultado comprovado: compilação; NÃO teste responsivo visual em navegador nem homologação real de IA neste lote. Nenhuma nova publicação Vercel; usuário deve autorizar deploy agrupado.

## 2026-10-18 — Cartões separados para estado das chaves OpenAI/Claude (não publicado)

- Solicitado pelo proprietário: mostrar status de ambas as chaves lado a lado, em destaque, para distinguir quando estão cadastradas ou não, e esclarecer se as duas trabalham ao mesmo tempo.
- Arquitetura vigente: podem ficar cadastradas simultaneamente no mesmo cofre, mas somente `ai_assistant_settings.provider` (global) é usado por chamada. Cadastrar credencial não muda o provedor ativo; trocar e ligar exigem salvar configurações. Troca automática/per-module ou envio simultâneo a dois provedores NÃO está implementado.
- Commit `d7390f2`: em `AiAssistantSettingsPanel.tsx` substitui duas legendas discretas por dois cartões na mesma linha em desktop, com `flex-wrap` responsivo em mobile; estados evidentes `Chave cadastrada` ou `Chave não cadastrada` e distinção `Provedor em uso pela JoIR` (baseado na configuração salva), `Selecionado no formulário` e `Pode ser configurado e testado independentemente`. Atualiza no estado React após salvar chave, não mostra nem expõe credenciais.
- CI `39132372563` disparado pelo commit temporário `6498f1d2`; disparo extra do workflow removido em `052610bd`; verificar resultado final. Os commits posteriores à alteração de UI são apenas CI e documentação.
- Nenhum deploy, alteração do cofre, mudança no Supabase ou sincronização VS Code neste lote. Produção conserva `d92625f`. Pendências anteriores de JoIR/layout/feedback continuam aguardando autorização de deploy em lote.

## 2026-10-18 — CI aprovado: cartões de status OpenAI e Claude

- Execução GitHub Actions `39132372563` (SHA `6498f1d2`) finalizada com **SUCCESS**; verificados typecheck e build dos apps site/sistema, scripts smoke de assinatura e PDF de contrato.
- Link: `https://github.com/altnixtecnologia/jornalir/actions/runs/39132372563`.
- Alteração funcional do lote: `d7390f2` somente UI. Depois do SHA validado, `052610bd` restaurou o workflow e os demais commits alteraram somente docs.
- Não há teste E2E de layout com navegador autenticado nem publicação deste lote. Em produção permanece o último deploy de `d92625f`, aguardando autorização para publicação agrupada de melhorias de JoIR.

## DEPLOY JOIR 2026-10-18 — indicadores OpenAI/Claude e UX

- Usuário autorizou explicitamente publicar todo o lote de JoIR e verificar pendências esquecidas. Comparado `d92625f38ec27f237c77e9eabe8486a8cd39b3c7` (produção anterior) com HEAD da feature `ad8724048bddcabfb38211fe7bd60d956d2d1b7c`: **29 commits ahead, 0 behind, 12 arquivos modificados**, todos de UI/código JoIR e documentação; sem migrations novas.
- GitHub Actions da última mudança funcional: `39132372563` SUCCESS (SHA `6498f1d2`), com typecheck, build site/sistema e testes de contratos/PDFs. Depois do SHA de CI, somente restauro do gatilho temporário e commits de documentação, sem alterar arquivos executáveis.
- Deploy Vercel criado com Git Source SHA exato `ad8724048bddcabfb38211fe7bd60d956d2d1b7c`, target Production, projeto `jornalir-sistema`, ID `dpl_A5sniiEiPKuRscHj18yVL6zBdgAq`; **READY**, `aliasError=null`. Inspeção independente do domínio `controle.altnix.com.br` confirmou mesmo ID/SHA. Site público separado não foi publicado. Nenhuma variável, chave de API, banco, migrations ou VS Code modificados nesta publicação.
- A entrega inclui JoIR como nome, menu agrupado, controles compactos Provedor | Modelo | Atualizar, cartões destacados OpenAI/Claude lado a lado, resultado do teste ao lado dos botões, clareza sobre campo da chave vazio após salvar e sobre switch ainda não salvo.
- Supabase consultado em modo leitura DEPOIS da publicação: uma chave OpenAI armazenada; nenhuma Anthropic; `ai_assistant_settings.enabled=false`, provedor `openai`, modelo `gpt-4o-mini`, todos os módulos em modo `off`. A OpenAI passou anteriormente dois testes HTTP 200 via audit events (registrados nesta mesma documentação). **Não ativar por SQL**.
- Próximos testes manuais com o proprietário: (1) conferir novo layout e feedback de chaves; (2) opcionalmente selecionar Anthropic, inserir a API key, clicar salvar e testar, SEM divulgar segredo; (3) ligar JoIR, definir ao menos um módulo `Assistido`, clicar **Salvar configurações da JoIR** na parte inferior; (4) recarregar e conferir persistência; (5) perguntar algo simples na página `/sistema/assistente-ir`, verificar resposta, tokens e auditoria; (6) conferir propostas/aprovações e permissão owner/não-owner.
- PENDÊNCIAS DISTINTAS DESTE DEPLOY: homologação autenticada e teste de geração real ainda não concluídos; Claude não cadastrado; autonomia agendada, executores sensíveis, seleção por módulo e chatbot de leitores com acesso exclusivamente público ainda não existem. Não declarar todas as funções de IA finalizadas apenas porque deploy READY.
- Handoff: HEAD após esta entrada é posterior ao SHA publicado SOMENTE por documentação. Ao retomar Codex ou Claude no VS Code, sincronizar a feature completa e verificar estado local antes de qualquer integração; NÃO reset/force-push nem tocar arquivos de produção sem nova autorização.

## 2026-10-18 — Diagnóstico de HTTP 400 com provedor Anthropic ativo (sem alteração funcional)

- Proprietário enviou prints: após recriar chave OpenAI, feedback `Conexão com OpenAI autenticada` às 11:02:59h BRT, mas conversa JoIR havia retornado `HTTP 400`; catálogo OpenAI também mostrou HTTP 401 em outra tentativa. Captura evidenciava OpenAI selecionado somente no formulário, **Claude em uso** no cartão de status.
- Consulta SOMENTE LEITURA ao Supabase confirmou `ai_assistant_settings` `enabled=true`, `provider=anthropic`, `model=claude-haiku-4-5`, módulos `agenda=assistido` e `site=assistido`, todos demais `off`, atualização `2026-10-18T13:58:05Z`. Chaves OpenAI e Anthropic salvas. OpenAI atualizada `2026-10-18T14:02:53Z`.
- Auditoria confirmou novo teste OpenAI HTTP 200 em `2026-10-18T14:02:58Z`; teste Claude HTTP 200 anterior. GET `/models` não equivale a POST de geração. É importante não diagnosticar o HTTP 400 da conversa como erro da OpenAI sem observar que **o provedor efetivamente salvo é Claude**.
- Proprietário orientado a selecionar OpenAI e `gpt-4o-mini`, manter JoIR ON + dois módulos assistidos, **clicar Salvar configurações gerais ao final da página**, recarregar e confirmar cartão `OpenAI: Provedor em uso` antes de testar geração simples. Não substituir mais chaves até teste direcionado.
- Vercel runtime logs indisponíveis para esta consulta (API indicou erro por janela de retenção); não afirmar causa específica do HTTP 400 Anthropic sem corpo seguro ou teste controlado. Nenhum deploy, migration, alteração na configuração em banco ou chave feito pelo agente nesta etapa.

## 2026-10-18 — Diagnóstico Anthropic HTTP 400 e identificador do provedor antes da conversa (não publicado)

- Proprietário informou HTTP 400 na conversa, sem saber qual API gerou o erro; exigiu exibir claramente a IA ativa antes de perguntar.
- Confirmado SOMENTE EM LEITURA no Supabase: `ai_assistant_settings.enabled=true, provider=anthropic, model=claude-haiku-4-5, agenda=assistido, site=assistido`, atualizado `2026-10-18 14:11:07Z`. Logo essa geração HTTP 400 foi com Claude/Anthropic; OpenAI estava cadastrada, mas não era o provedor salvo.
- Documentação Anthropic: `claude-haiku-4-5` é alias válido da API direta. HTTP 400 pode indicar solicitação inválida **ou limite de gastos da organização/workspace**, sendo incorreto deduzir que o modelo está errado ou que necessariamente falta saldo sem inspecionar o retorno. A conta Claude Pro/ChatGPT Plus não deve ser confundida com créditos API; os planos Claude Max/Team elegíveis podem resgatar créditos mensais API mediante vínculo.
- `9a94390`: Server Action `askAssistantAction` passa a classificar apenas tipos/expressões conhecidas dos erros de geração do provedor: sem saldo, limite de gastos, modelo, tokens, autenticação, rate limit etc. Não expõe resposta bruta, payload, cabeçalhos, prompt nem chaves da API. Resultado de erro pode indicar `provider` e `model`.
- `e0e1d61` e `2749c8d`: a página server-side passa provedor/modelo SALVOS no banco para a interface; a conversa exibe antes de enviar `IA EM USO NESTA CONVERSA: Anthropic / Claude · claude-haiku-4-5` (ou OpenAI), com link Configurar. Aviso para recarregar ao alterar provedor; não muda configurações.
- Verificação de código por inspeção; CI `https://github.com/altnixtecnologia/jornalir/actions/runs/39135212430` acionado temporariamente em `d64bec8`, gatilho extra já revertido em `c6b3a1b`; aguardar resultado final.
- Nenhuma nova publicação Vercel, alteração no banco, alteração de segredos ou VS Code. Produção segue `ad8724048bddcabfb38211fe7bd60d956d2d1b7c`. Após CI, pedir autorização de publicação; para esclarecer causa HTTP400, pedir print somente de saldo/limite da Anthropic ou testar uma geração única com o diagnóstico novo, sem compartilhar credenciais.
- Pendência UI de destaque/agrupamento visual das linhas dos módulos já registrada previamente e ainda não abordada neste lote.

## 2026-10-18 — CI validado para painel com provedor ativo e diagnóstico do HTTP 400

- GitHub Actions run `39135212430`, commit funcional + trigger `d64bec8e`, terminado **SUCCESS**. Workflow conferiu TypeScript, build Next.js dos apps e testes existentes de PDF/contratos.
- Depois desse SHA só foi removido o gatilho de CI temporário (`c6b3a1b`) e os docs atualizados; nenhum código executável adicional.
- Link: `https://github.com/altnixtecnologia/jornalir/actions/runs/39135212430`.
- **Sem deploy**: QA visual e diagnóstico de retorno de API ainda dependem de publicação autorizada. O HTTP 400 anterior não se torna automaticamente esclarecido porque o CI passou.

## SITE PÚBLICO — PRIMEIRO LOTE PARA LANÇAMENTO (18/10/2026)

**Prioridade alterada pelo proprietário:** preservar a JoIR sem novos gastos; concentrar desenvolvimento na estreia do site Jornal Informativo Regional, especialmente publicação editorial e publicidade. O sistema administrativo será desenvolvido/testado até o início do uso previsto para 2027, mas não bloqueará a estreia do site exceto pelas integrações de publicação e anúncios.

### Base verificada antes de alterar
- GitHub `altnixtecnologia/jornalir` monorepo, apps independentes `apps/site` e `apps/sistema`. Branch nova `feature/site-lancamento-editorial-publicidade-20261018`, criada como derivação da `feature/assistente-ir-base-20261018` para não misturar novos commits de site à branch congelada da JoIR.
- Site público Vercel projeto `jornalir`, domínio `jornalir.vercel.app`: deploy Production `dpl_7KQH8kBA8MpW5XnHFQCJe4tghmk2` `READY`, SHA `354e7837f54921d7227897a6acef543dfb145e8f`; diferença desse SHA até a branch anterior: **nenhum arquivo em `apps/site/` modificado**. Sistema administrativo de produção independente `controle.altnix.com.br` mantém seu próprio deploy.
- Banco Supabase `site-system-ir` em leitura: `public_articles` tem 23.365 matérias visíveis publicamente; `public_article_placements` 8 mainCover, 3 highlightStrip, 7 latestNews, 4 localSpotlight; última data publicada é `2026-10-12T00:10Z`. Não confirma qualidade editorial/capas individuais, apenas dados disponíveis na view.
- Publicidade: 6 posições ativas no view `public_site_ad_slots`. Somente posições 1 e 2 têm mídias públicas gerenciadas via painel (2 cada); posições 3–6 estão `managed_by_panel=false` e `has_media=false`, portanto em `siteAdsService.ts` recorrem aos anúncios LEGADOS de `apps/site/public/uploads/anuncios/` como fallback. Conferir com proprietário validade e patrocinadores antigos antes do lançamento. Nenhuma publicidade foi alterada no banco.
- `apps/site/vercel.json` mantém `git.deploymentEnabled=false`; houve várias tentativas de preview `CANCELED` no projeto site nos commits anteriores da JoIR. Evitar deploys sucessivos por commit e publicar somente em lote autorizado.
- Ferramenta de visualização externa não conseguiu abrir o domínio público, mas Vercel confirmou produção READY. Não afirmar que UX desktop/mobile foi homologada.

### Código entregue exclusivamente na branch de site
1. `300fcee` — homepage: três faixas de pares de anúncios deixam de desaparecer em tablets (`md:hidden` → `xl:hidden`), enquanto as colunas laterais seguem exclusivas do `xl`.
2. `a969768` — página de matéria: primeiro par publicitário também aparece em tablet (`md:hidden` → `xl:hidden`).
3. `e1ddf1a` — links de patrocinadores marcados `rel="sponsored noopener noreferrer"` sem alterar URLs nem comportamento de rotação.
4. `672b02e` — página individual de notícia recebe metadados SEO dinâmicos baseados apenas na matéria publicada: título, descrição textual, canonical, OpenGraph, Twitter preview e imagem de capa quando disponível; URL não existente `noindex`. Usa `cache()` React para evitar dupla leitura entre metadata e render da página no mesmo request.
5. `ff5f876` — `metadataBase` global usa `NEXT_PUBLIC_SITE_URL` quando definido, com fallback `https://jornalir.vercel.app`; atualizar env quando houver domínio definitivo.

- CI GitHub Actions `Validate project` acionado uma única vez via gatilho temporário `1048d04` (run `39137183679`) e branch do workflow restaurada em `beb4292`. Conferir resultado final antes de considerar compilação aprovada. NÃO houve novo deploy de produção nem alteração no banco, credenciais ou VS Code.
- O ajuste de tablet NÃO muda regra de 6 posições nem tempo/efeito/formato por imagem. Na página de matéria o celular/tablet ainda mostra somente posições 1–2; decidir explicitamente com usuário se pares 3–4 e 5–6 devem ser apresentados também nas matérias (padrão atual do projeto). Não mudar publicidade aprovada silenciosamente.
- Também existe `AdSenseSlot.tsx` com reserva expandível contendo texto "integração futura". Verificar decisão editorial para retirar o placeholder do lançamento ou substituí-lo por anúncio real; não alterar layout aprovado sem decisão.

### Critérios reais para liberar lançamento (a executar em lotes)
P0: (1) criar e revisar uma matéria real no sistema, publicar e confirmar no site sua URL, ordenação, capa/galeria, editoria e exibição mobile/desktop; (2) verificar destaques 8/3/7/4 e que matérias rascunho/agendadas nunca vazem; (3) cadastrar, ordenar e controlar tempo/efeito e validade de patrocinadores das 6 posições, verificar fallback legado e exibição celular/tablet/desktop; (4) testar notícia individual, busca/paginação, navegação, links, compartilhamento, erros 404, acessibilidade e SEO; (5) conferir jornal online e assinatura/anúncios, PDFs e visualizadores, integrações básicas e R2/Range; (6) definir domínio final, HTTPS/redirect, sitemap/robots e publicar em única janela autorizada.
P1: performance/Core Web Vitals, alertas de erros, painel de estatísticas, vínculo venda comercial→mídia, jornal público integrado às redes e push, revisão visual fina e homologação por usuário.
- **Não chamar site 100% homologado só por build**. Próxima ação: confirmar CI e completar auditoria P0 das rotas/editorial/ads; entregar relatório pequeno e solicitar teste acompanhado com sessão de proprietário no sistema, sem inventar material editorial.

## CI FINAL DO LOTE SITE — 39137183679

- GitHub Actions `Validate project`: `https://github.com/altnixtecnologia/jornalir/actions/runs/39137183679`, SHA funcional + gatilho `1048d04`: **SUCCESS**. Typecheck e build site, typecheck/build sistema e smoke de contrato e PDF concluídos.
- Workflow temporário restaurado em `beb4292`; commits posteriores são **somente documentação**, sem mudança de código executável.
- Continuam pendentes testes visuais responsivos com navegador, testes autenticados de matéria e patrocinadores, dados atuais, decisão sobre quatro posições com anúncios antigos, sitemap/robots e lançamento final. **Nenhum deploy realizado.**

## CORREÇÃO EDITORIAS — tabela desalinhada na listagem 18/10/2026

- Proprietário enviou captura do módulo `/sistema/editorial/editorias` com divisórias desalinhadas e colunas do nome se comportando como linhas separadas.
- Causa encontrada no código: `<td className="materia-title">...` usava a classe compartilhada `.materia-title { display: block; }` em uma **célula HTML `td`**, substituindo o `display: table-cell` esperado. Isso rompe o layout tabular e o alinhamento visual dos contornos.
- `190c42a`: corrige apenas `EditoriasManager.tsx`, colocando `<span className="materia-title">...</span>` **dentro** do `td`, mantendo nome, ordenação, ID, ações, status e modo edição inalterados; acrescenta classe específica `editorias-table`.
- `653112d`: `apps/sistema/src/app/globals.css` adiciona regra CSS específica `.editorias-table tbody td { vertical-align: middle; }` para alinhar controles/textos na mesma faixa, inclusive edição inline. Nenhuma alteração no estilo genérico de outras tabelas.
- CI GitHub Actions `39138671694` iniciado com gatilho temporário `82213fd` e gatilho padrão restaurado em `245f136`. Conferir conclusão antes de marcar testes aprovados.
- Estado: somente GitHub branch `feature/site-lancamento-editorial-publicidade-20261018`. Sem deploy no site/sistema, sem alterações na base, configurações de anúncios, chaves, VS Code e sem colaboração simultânea Claude. A Claude receberá PRIMEIRO apenas instrução para sincronizar a branch inteira, e aguardar relatório.
- Pendente: verificar visualmente em PC e tela pequena depois de publicação autorizada, com modo edição e botões de ordenação testados.

## VALIDAÇÃO APROVADA — correção visual da tabela Editorias

- GitHub Actions run `39138671694`, SHA de código + gatilho CI `82213fda`: **SUCCESS** (typecheck/build apps/site e apps/sistema; smoke contratos e PDFs). URL: `https://github.com/altnixtecnologia/jornalir/actions/runs/39138671694`.
- Workflow normal foi restaurado em `245f136`, e commits subsequentes alteraram apenas documentação. O código corrigido validado permanece o mesmo.
- **Nenhuma publicação**: para validar divisórias com navegação real é necessário deploy posterior autorizado, seguido de inspeção na página editorias, inclusive linha em edição e reordenação. Não foi feita alteração no Supabase, VS Code ou anúncios.

## IMPORTAÇÃO REAL — 56 matérias do site legado publicadas (18/10/2026, Lotes 1-3)

- Branch `feature/site-lancamento-editorial-publicidade-20261018`, commits de código
  `18c15c5`/`fcf71c1`/`7b68bfd` (sync incremental reaproveitado de
  `scripts/legacy-audit/`, nenhum importador novo). Dois dry-runs confirmaram os
  mesmos números antes da execução real: 240 itens no legado, 61 candidatas, 5 já
  existentes, 56 novas elegíveis, 0 exceções/revisão/quarentena.
- Decisão definitiva do proprietário: as novas entram `status=published` direto
  (comportamento histórico das importações do legado), via novo flag explícito
  `--publish-recent` (nunca default implícito).
- **Importação real executada** (`--commit --publish-recent`): 56 matérias criadas,
  168 imagens enviadas ao R2 e vinculadas, **0 falhas**. As 5 matérias já existentes
  não foram tocadas (`--reconcile-existing` não usado).
- Verificação direta no Supabase confirmou: 56 novas com `status=published` (delta
  exato +56 em `articles` e em `article_external_sources`, sem duplicata); 61/61
  visíveis na view pública; 0 divergências entre `published_at` e a data original do
  legado; 61/61 com referência de origem (URL/ID/data); 5 existentes com `updated_at`
  idêntico ao snapshot anterior à importação (intactas); 0 notificações e 0
  destaques criados.
- Nenhum push no GitHub, nenhum deploy na Vercel, nenhuma outra funcionalidade
  alterada. Relatório completo e evidências em `docs/STATUS-E-HANDOFF.md`, seção
  "LOTE 3".

## 2026-10-19 — ChatGPT, revisão final do backend FCM (somente branch)

- Branch `feature/backend-fcm-notificacoes-20261019` isolada da Claude e da `main`.
- Quatro correções de código em sequência: `40217a3` (reenvio duplicado no formulário), `2fd3261` (janela de 24h e última atividade antes de enviar FCM), `4886e02` (URL editorial compatível com Android), `f6e0e49` (formulário usa link correto). Documentação no commit `607866c`.
- Conferência estática de oito invariantes passou: alias FCM, guards de cadastro/entrega, URL `/noticias/<slug>`, reenvio sob transição e TTL. **Não equivale a typecheck/build ou envio real.**
- Supabase `site-system-ir` sem migrations 20261030... aplicadas, sem tabelas `native_push_*`, sem inscrições/eventos na conferência. Nunca aplicar todas as migrations em bloco sem verificar efeitos; `20261030100100` deixa `assine_enabled=false` por padrão.
- Vercel `jornalir-sistema`: `CRON_SECRET` existe, variáveis Firebase/FCM ausentes. Nenhuma variável alterada. Todas as flags de disparo seguem desligadas.
- Claude relatou Android v.00.02 build debug OK, áudio original validado e projeto Google Cloud `jornal-ir-app`; integração Firebase ainda bloqueada (HTTP 403 em addFirebase). Os seis commits locais da Claude (HEAD relatado `4d0d49e`) ainda **não foram enviados** à branch remota `feature/site-lancamento-editorial-publicidade-20261018`. Não forçar merge antes de receber o HEAD completo.
- Nenhum deploy/migration/disparo real. APK release e E2E ainda pendentes. O Jornal Online/PDFs foi explicitamente colocado em espera pelo proprietário.


## 2026-10-19 — Backend+Android FCM integrados; R2 dedicado aprovado

- Branch `feature/integracao-fcm-android-20261019`; commit de merge com **dois pais** `07e22958b6b62e4eec258cf256d463bc7f388a7a`. Integra HEAD remoto Claude `8f2717800978ffc976b7d888c8462f78e076dfa4` e backend ChatGPT `863c3b3e77f9b795ea898f99e1e576f020701331`. Comparação com cada branch confirma **ahead sem behind**, preservando históricos completos e alterações. Nenhuma alteração na `main`.
- Preparação Firebase: projeto `jornal-ir-app-5c6e2`; conta de serviço `fcm-sender@jornal-ir-app-5c6e2.iam.gserviceaccount.com`, segundo relato da Claude, credencial JSON protegida no PC do proprietário, fora do repositório. O APK v.00.02 release foi compilado/assinado pela Claude, mas ainda não foi enviado/distribuído.
- Vercel `jornalir-sistema` Production: **criadas e conferidas diretamente** as variáveis `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `NATIVE_FCM_REGISTRATION_ENABLED=false`, `NATIVE_FCM_DELIVERY_ENABLED=false`, `EDITORIAL_PUSH_MANUAL_ENABLED=false`. A chave sensível `FIREBASE_PRIVATE_KEY` permanece pendente para instalação direta pela Claude (nunca transportar por chat). Sem deploy.
- Supabase `site-system-ir`: verificação de leitura confirma `notification_events` e os campos `app_kind,kind,scheduled_at,target_profile_id`; ainda **não existem** `native_push_devices` nem `native_push_deliveries`. Migration `20261030101100_native_fcm_devices_delivery.sql` não aplicada. Evitar processar lote de outras migrations sem revisão, e conferir ordenação futura para não introduzir buracos no histórico.
- Jornal Online: o proprietário aprovou **bucket exclusivo `jornal-ir-edicoes` na mesma conta Cloudflare R2**, classe Standard. A própria conta Cloudflare não está conectada ao ChatGPT; instruir Claude a criar via Wrangler com login autorizado e confirmar lista, sem disponibilizar objetos nem iniciar importação. Decisão detalhada no documento `docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md`.
- A validação conjunta `npm ci`/typecheck/build, homologação API, RLS/RPC e envio FCM para único aparelho consentido continua pendente. Testar o merge sem substituir o checkout local, que contém commit adicional ainda não publicado `4bf6114` (Claude).
- Nenhuma migration remota, distribuição de APK, disparo real, ativação de flags ou deploy automático foi executado.


## 2026-10-19 — Asaas provisório somente para homologação; sem cobrança real

**Decisão expressa do proprietário:** a conta Asaas atual da Altnix será apenas referência técnica para **testes da integração** enquanto o Jornal IR não possui a conta Asaas oficial. **NÃO emitir, cancelar, baixar, alterar ou enviar cobranças reais agora**, nem alterar credenciais/webhooks existentes. Preferir testes locais/simulados ou ambiente sandbox isolado. O sistema deve estar pronto para troca da conta emitente no futuro, mas a simples substituição das variáveis .env não migra clientes/cobranças anteriores: preservar o identificador da conta de origem em cada pagamento/cobrança, históricos e respectivos webhooks quando houver cutover. A migração cadastral/financeira entre Altnix Informativo e Jornal IR requer snapshot/backup, crosswalk de IDs, conciliação Asaas e validação antes de qualquer virada; player/campanhas e automações atuais continuam intocados.

**Correções técnicas somente no GitHub nesta rodada:** `6003f4e` corrigiu declarações estáticas de runtime/dynamic na rota FCM; `5e3697e` separou credenciais R2 específicas de edições das credenciais do bucket de fotos; `6679dee` documentou o processo do bucket exclusivo. Sete verificações estáticas específicas passaram, sem typecheck/build executados após essas correções; Claude deverá validar na worktree antes do deploy. **Firebase:** a Claude reportou chave privada instalada na Vercel; a presença da variável `FIREBASE_PRIVATE_KEY` foi confirmada pelo ChatGPT somente por metadados, sem ler o valor. As flags FCM seguem `false` e nada foi publicado. **Cloudflare:** bloqueada até `npx wrangler login` interativo no computador do proprietário. Não importar PDFs até autorização específica.

## 2026-10-19 — Backend FCM e inscrição Android publicados; testes de envio ainda pendentes

- Publicações **READY**: sistema `dpl_D9tcK1o2rmYgpv4wn5BetYwEQ5E4`, site `dpl_D44iAFneBQ4eezBwSx6kAXTDm2rW`, ambos código `10afa95865083511b5194b2aa063d9addf298141`.
- Migration FCM aplicada em produção com versão real `20261019202943`. Nome do arquivo GitHub alinhado à versão aplicada; não reaplicar migration antiga `20261030101100`.
- Android pode consentir e se cadastrar em `/notificacoes`; testes FCM individuais via painel owner/admin; envio editorial e worker geral desligados. Zero push enviado durante implantação.
- Handoff detalhado: `docs/FCM-ANDROID-SERVIDOR-DEPLOY-20261019.md`. Claude deverá sincronizar branch inteira no VS Code depois de examinar commits locais, sem reset/force-push, e testar normal+urgente no aparelho antes de liberar envio geral.

## 2026-10-19 — Ajuste de sininho e cabeçalho Android publicado
- Site Production READY `dpl_7gK3Qm1XUVBez9XYRzJzA7iyDAe1` no SHA `1ac98985ea14ee927ab60d7292476b48f0ea25f4`. Cabeçalho IR centralizado por grid simétrico, ação no sininho para `/notificacoes`. Backend permanece `dpl_D9tcK1o2rmYgpv4wn5BetYwEQ5E4`.
- Smoke HTTP 200 na página pública; **precisa validação visual e de inscrição no aparelho real**. Zero disparos realizados durante a implantação.

## 2026-10-19 — Primeira abertura de notificações Android
- Site publicado READY `dpl_5LKi5gxA69a1eFS6T32bwpmsbSM3`, SHA `88a01653724d72e2431de84141798315c61de03c` na branch `feature/ativacao-inicial-notificacoes-20261019`.
- Diálogo de consentimento no primeiro acesso nativo; "Agora não" persistente; solicitação da permissão somente após toque; listeners FCM globais; preferências do usuário persistidas. API e flags de push geral não alteradas. Documentação detalhada `docs/ANDROID-PRIMEIRA-ABERTURA-PUSH-20261019.md`.
- Requisito editorial ratificado pelo proprietário: seleção Sem/Normal/Urgente deve enviar push automaticamente na transição para publicado, também pelo agendador, sem dupla entrega em edição/republicação; **ainda não ativado em produção**.

## 2026-10-20 — Push automático por publicação: ATIVADO em produção
- **Sistema** Production READY `dpl_Htm1iaAVYwQahZ7jXRCA4K2f7axJ` SHA `67dc34e923f99818c8d53be6d362b95717ba97ae`, release `feature/push-automatico-editorial-20261019`. Site público não redeployado.
- 3 migrations aplicadas com versões reais 20261020001444, 20261020001449, 20261020001452, arquivos SQL renomeados na branch para refletir ledger. NÃO duplicar/reaplicar no VS Code.
- Gatilho agora envia `articles` status→published / mode normal,urgent para `notification_events`, não outbox antiga. Documentado e testado em transação rollback: 0 antes, 3 depois, sem duplicata ao editar/republicar, sem persistir eventos fictícios.
- Ambiente Production `NATIVE_FCM_DELIVERY_ENABLED=true` e flag banco `site_notification_feature_flags.article_publish_events_enabled=true`; cron HTTP 200, `nativePush.enabled=true`, a cada minuto. Nenhum evento gerado retroativamente, 3 inscrições Android e 0 Web ativas na conferência.
- UI Matérias explica envio automático e remove botão manual inativo. Matéria importada do PDF/rascunho usa o mesmo gatilho quando for publicada, com Normal ou Urgente selecionado.
- **Pendente de aceite real**: matéria publicada real Normal/Urgente -> entrega FCM e teste de som/abertura no celular. Handoff detalhado `docs/NOTIFICACOES-AUTOMATICAS-EDITORIAL-20261020.md`. Sincronizar branch inteira, preservar alterações locais Claude, nunca reset/force, não fazer novo deploy ou migrations sem autorização.

## 2026-10-20 — Botão Voltar do Android / confirmação de saída v.00.03 — CÓDIGO PRONTO, NÃO PUBLICADO
- Aprovação do usuário: sair é a última camada. Ao voltar, fechar galeria/menu/busca/sininho, depois navegar páginas anteriores; se abrir direto por push, voltar para início; na última página mostrar diálogo **Cancelar | Sair**; Android Voltar no próprio diálogo cancela.
- Implementado plugin `@capacitor/app@7.1.0` no site e no mobile com listener `backButton`; exitApp só por toque explícito em **Sair**. `apps/mobile` versionCode 4 / versionName v.00.03, mantém assinatura e `com.jornalir`.
- Branch `feature/android-back-navigation-v0003-20261020`, SHA de código `16610398414664a88e65c77470909dbbb821274c`; preview Vercel READY `dpl_pwUUSJNqiDfEp3cGDwNdM676MmqG`, build Next/TypeScript e HTTP 200; Production **inalterada** em `b190a2677d574752ef1d8dc2005385d42f103040`.
- **Pendente**: Claude Code local deve `git fetch`, integrar preservando local, `npm install` (atualizar package-lock), `npx cap sync android`, compilar `assembleRelease` com keystore original, verificar certificado e testar botão/gesto Android em celulares reais, FCM normal/urgente. Só depois enviar APK para R2 e liberar versão no painel. Não há novo APK distribuído.
- Plano e cuidados completos em `docs/ANDROID-VOLTAR-CONFIRMAR-SAIDA-V0003-20261020.md`. Não sobrescrever trabalho local/branch main, não fazer force/reset, não atualizar dispositivos remotos sem aprovação.

## 2026-10-20 — Publicador de APK v.00.03 preparado
- Em `feature/android-back-navigation-v0003-20261020` criado `scripts/r2-webp-optimize/publish-android.mjs` e handoff `docs/CLAUDE-RELEASE-COMPLETO-V0003-20261020.md`.
- Fluxo valida assinatura original, versionCode4, integridade do R2; libera Supabase e testa botão do site na mesma execução. Sem assinatura local nem APK ainda; production status permanece `published=false`.
- Rodar no VS Code via Claude Code após compilar v.00.03 release e testar por cima da v.00.02; publicação no site é parte obrigatória do mesmo trabalho.

## 2026-10-20 — Splash 2,5s, Últimas Notícias e compartilhamento
- Site production `dpl_4qqTbLGj73UCDAp1A5N6HPJPHKUm` READY, código `0a12656ca71f03c05e6473b3ec98133fbb5bfb41`. Feature `feature/splash-noticias-compartilhar-20261020`.
- Splash do WebView reduzido para 2,5s, mais 720ms de revelação do portal (scale/blur/fade); permanece web, não nativo do Android. No Chrome não aparece.
- Últimas Notícias: sem Ler matéria, foto e título principal abrem matéria; títulos laterais são links, números continuam trocando seleção; rotação intacta.
- Compartilhar junto aos dados da notícia: Copiar link, WhatsApp, Facebook, Instagram (Web Share nativo se suportado ou copiar para Direct), Mais opções nativas; metadados OG preservados.
- Conferidos 200 no site oficial início/notícia/versões; pendente QA no Android (Instagram pode não aceitar publicação de URL em Stories/feed).
- Claude local: buscar branch com `git fetch`, preservar commits/stash, integrar sem force/reset; não fazer deploy duplicado; APK v.00.03 segue em homologação.


## 2026-10-20 — Agenda/Pauta móvel, baixa individual, permissões e auditoria — PRIMEIRA ETAPA (sem deploy)
- Branch remota `feature/agenda-mobile-sync-auditoria-20261020`, criada da `feature/splash-noticias-compartilhar-20261020`, base `be3e61daaf83a4a26a0cea1b344b8f1e645bcf7e`. Não mesclada à main, nem integrada ao VS Code.
- Primeira etapa em código: UX mobile, filtros/cores estáveis por responsável, botões de concluir própria participação, status gerais restritos a owner/admin liberado, indicação de progresso por pessoa, Supabase Realtime com reconciliação, aviso de alterações remotas em formulários abertos, histórico protegido e autorização separada de leitura de logs.
- Migration preparada `20261020204050_agenda_team_permissions_progress_audit_20261020.sql`, **NÃO aplicada**. RLS e RPCs novas dependem de homologação de banco e aplicação juntas. O histórico transacional desta etapa cobre Agenda/Pauta e concessões; auditoria de todos os módulos continua pendente.
- **Nenhuma alteração na produção, nenhum APK, nenhum deploy, nenhum teste real em telefone, nenhum typecheck/build local executado nesta sessão.** Arquivos e plano de teste documentados em `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`.
- Próxima sessão Claude/Codex: `git status -sb`, `git fetch origin`, ler handoff, comparar branches e incorporar sem sobrescrever trabalhos locais. Não resetar/forçar, não publicar ou aplicar migration sem autorização. Faltam unificação completa Agenda↔Pauta, auditoria global, teste local/RLS, notificações e app de equipe.


## 2026-10-20 — Segunda etapa da Agenda/Pauta unificada (GitHub, NÃO publicada)
Após a Claude validar typecheck/build **da primeira etapa somente**, o ChatGPT continuou a mesma branch `feature/agenda-mobile-sync-auditoria-20261020`, sem tocar VS Code ou produção.
- Migration nova `20261020204121_agenda_pauta_unified_source_20261020.sql`: backfill conservador de pautas antigas para a Agenda e manutenção dos IDs/vínculos de matérias; Agenda como única fonte de título/data/descrição/status; triggers atualizam snapshots de compatibilidade; criação/edição de pautas atomizadas por RPCs; vários responsáveis; baixa compartilhada e segurança/versão contra edição simultânea. Depende de `20261020204050_agenda_team_permissions_progress_audit_20261020.sql`.
- Aplicação: retirado campo “Vincular à agenda”; pauta sempre registrada na Agenda; cartões refletem atualizações e baixa individual; preservado “Criar matéria” para operadores com módulo editorial; histórico de auditoria autorizado visível também no desktop.
- Conferência estática dos nomes das funções, links e formulário: OK. **Sem build/typecheck/E2E/execução SQL neste segundo lote**; Claude deve fazer. Supabase e Vercel continuam inalterados; handoff atualizado em `docs/AGENDA_EQUIPE_MOBILE_AUDITORIA_HANDOFF_20261020.md`.
- Ainda pendente: auditoria completa dos demais módulos, avisos pessoais, alertas/vibração, app administrativo, migrações de homologação e QA real.

## 20/10/2026 — AGENDA E PAUTA PUBLICADAS: ESTADO FINAL CONFIRMADO
A versão de sistema da Agenda/Pauta foi publicada na Vercel PRODUCTION, deployment `dpl_7BZUuoRTtNr7xDZ5uS3tjvYPwLgY`, commit de código `46c0f17595f4404f9874a6b1a9fbb518b74730b9`, status READY, domínio `controle.altnix.com.br` confirmado. Staging READY `dpl_2PoV84isbHBgpqQuXkWjemzseMgK` do mesmo commit. Três migrations foram APLICADAS com sucesso no projeto Supabase `site-system-ir` na seguinte ordem e com as versões reais do ledger: `20261020204050_agenda_team_permissions_progress_audit_20261020`, `20261020204121_agenda_pauta_unified_source_20261020`, `20261020204306_agenda_internal_trigger_exec_hardening_20261020`. Os arquivos SQL do GitHub foram renomeados para os mesmos nomes/versões reais neste commit para evitar reexecução inadvertida. NUNCA reaplicar estes SQLs no projeto remoto; conferir sempre o ledger primeiro. A primeira e segunda migrations foram também verificadas juntas em transação com ROLLBACK, com testes reversíveis de criação de pauta, conclusão individual, reabertura, edição, sincronização e auditoria; dados de teste não persistiram. A produção tinha 0 pautas/0 agendas antes da publicação e manteve 0 ao fim das migrations. Realtime habilitado nas 3 tabelas. Execução direta das três funções de trigger foi revogada para `anon` e `authenticated`, verificado por `has_function_privilege`. Build Next.js e TypeScript aprovados no staging e produção. Sem testes com múltiplos usuários ou celulares reais autenticados. Claude deve FAZER FETCH da branch para incorporar renomeação e documentação e preservar a branch Android v.00.03 e stash; não executar migration/deploy adicionais sem autorização. Auditoria de todos os módulos, notificações pessoais e app administrativo ainda pendentes.

## 23/10/2026 — PR #15: emissão comercial protegida e trilha jurídica (NÃO PUBLICADA)

- **Branch remota:** `feature/homologacao-integrada-ir-20261023`, PR #15,
  base `feature/abrangencias-geo-notificacoes-20261021`. Não incorporada à
  produção, ao Supabase remoto nem à worktree oficial do VS Code.
- Evolução da preparação de contratos comerciais: conferência jurídica de
  cliente PF/PJ, qualificação obrigatória de ambas as partes, valor por serviço
  vs. pacote, modelo jurídico atual e campos obrigatórios preenchidos. Minutas
  continuam marcadas como NÃO ASSINÁVEIS.
- **NOVO:** aprovação por revisor com justificativa, histórico transacional
  `commercial_contract_review_events`, PDFs definitivos privados em
  `commercial_contract_documents` com versão do modelo, SHA-256,
  imutabilidade e download autenticado. Ficha do cliente mostra o vínculo.
- **Reabertura:** somente antes de existir primeiro PDF emitido, com motivo
  preservado no histórico. Após emissão não há alteração/destruição da
  evidência; futuros ajustes devem ser aditivos.
- **Migration nova, somente no GitHub:** 
  `20261111100000_commercial_contract_legal_approval_documents.sql`.
  NÃO APLICAR ao `site-system-ir` de produção antes de homologar todas as
  migrations da PR e realizar backup/rollback.
- **Integração ainda pendente:** assinatura eletrônica comercial com
  consentimento, convites/OTP/múltiplos signatários, comprovantes, reenvio,
  aditivos, e idempotência/reconciliação para falha após upload. Assinador
  institucional NÃO foi modificado e não aceita documentos comerciais ainda.
- **Testes:** builds, TypeScript e Supabase descartável verificados via GitHub
  Actions ao longo dos lotes; conferir resultado do SHA mais recente da PR
  antes de considerar CI final verde. Nenhum teste ponta a ponta com pessoas
  autenticadas em banco de homologação real foi realizado.
- **Outras pendências aprovadas preservadas:** usuários e convite/SMTP;
  estrela de capa da matéria; recorte desktop sem mexer no mobile;
  limites/validações de upload Supabase Pro; depois teste geral e publicação.
- **Claude/Codex local:** ao retornar, verificar pasta `Site-sistema`,
  branch, HEAD, worktrees e stashes; fazer fetch, comparar história e integrar
  o conjunto todo sem sobrescrever arquivos locais. Não forçar merge, não
  aplicar migrations, não dar push da branch principal ou deploy sem aprovação.

## 23/10/2026 — Continuidade PR #15: signatários comerciais + estrela de capa

- Branch `feature/homologacao-integrada-ir-20261023` permanece a
  única branch alterada pelo ChatGPT neste lote, sem merges nem deploy.
- Banco de preparação comercial isolado, com versionamento de listas
  `draft/superseded`, uma vigente por PDF e RPC atômica protegida.
  A aplicação oferece cadastro e correção de representantes/ testemunhas.
  **NENHUMA assinatura real, convite, cobrança ou envio foi efetuado.**
- Editorial: restaurado botão estrela nas imagens vinculadas à matéria
  para promover foto da galeria à capa. A capa anterior permanece na
  galeria, preservando legenda/crédito. Escolha de capa identificada
  pelo papel `cover`, não por índice 0. Adicionados testes.
  **Crop mobile não foi alterado.**
- Workflows do GitHub `Validate project`, `Finance RLS sandbox` e
  `Supabase complete migration rehearsal` foram atualizados para cobrir
  estes fluxos. Conferir o SHA final antes de considerar o lote aprovado.
- Pendências: assinatura comercial completa e E2E autenticado;
  usuários/SMTP de ativação; recorte desktop; limites Supabase Pro;
  demais integrações e QA geral. Produção e banco remoto intactos.
- Na próxima sessão Claude/Codex, apenas então sincronizar o VS Code
  mediante `git fetch` e reconciliação segura, como já combinado.

## 23/10/2026 — Ajuste adicional de recorte EXCLUSIVO do desktop

- `ArticleImageEditorModal.tsx` e CSS: zoom fino por roda do mouse/
  trackpad somente quando `(min-width: 768px) and (pointer: fine)`,
  controle deslizante 100–400% com passo de 10% e alça do recorte maior
  somente no desktop. A tela, os gestos e o layout de recorte **mobile não
  foram alterados**. Nunca modificar a foto original: criar derivada.
- `ArticleMediaPicker.tsx`: botão estrela devolvido às fotos já vinculadas,
  com `aria-pressed` e identificação correta da capa por `role=cover`.
  A função de promoção mantém foto anterior na galeria com metadados.
- Teste automatizado adicionado para a regra de troca de capa.
- **Pendente QA visual real**: zoom/arrastar/alça no Chrome desktop e
  comparação mobile para detectar regressão. Não publicado.

## 23/10/2026 — PR #15, fluxo comercial de assinatura eletrônica (isolado)

- Implementado na branch `feature/homologacao-integrada-ir-20261023`.
  Arquivos: `supabase/migrations/20261113100000_commercial_signature_workflow.sql`,
  `apps/sistema/src/lib/signatures/commercialSignatures.ts`,
  `apps/sistema/src/app/assinar-contrato-comercial/`,
  `apps/sistema/src/app/api/assinar-contrato-comercial/`,
  `apps/sistema/src/features/comercial/CommercialContractSignerCanvas.tsx`,
  `CommercialSignatureRequestsPanel.tsx` e novas rotas de evidências.
- Fluxo: revisor confere PDF e participantes -> cria rodada de convites
  individuais -> operador copia link uma única vez (sem envio) ->
  signatário confere PDF original, recebe OTP e confirma o e-mail ->
  desenha assinatura e aceita termo -> serviço gera comprovante e PDF
  cumulativo com SHA-256 -> próximo signatário pode assinar ->
  último conclui rodada. Links podem ser substituídos com justificativa;
  os anteriores são revogados.
- Dados institucionais permanecem separados. Não produz PIX, faturas,
  envios automáticos, NFSe ou efeitos externos.
- **Condição de entrega:** aguardar três workflows verdes do commit
  final; ensaio de assinaturas reais em homologação e revisão jurídica
  ainda necessários. Migrar em produção/publicar só com autorização.
