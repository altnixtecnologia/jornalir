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
