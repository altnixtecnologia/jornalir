# Portal público do Jornal IR — decisões e pendências atualizadas (04/11/2026)

**Escopo:** SOMENTE `apps/site` (portal público do Jornal Informativo Regional). Não confundir com o sistema administrativo, Altnix Informativo ou Altnix Platform.

## Estado geral e prioridade (declaração atual do proprietário)
- Portal e experiência visual considerados **bons / praticamente concluídos**, sem necessidade de redesenho nem rodada imediata de alterações cosméticas.
- Pequenos ajustes de preferência visual podem surgir durante a utilização. **Deixar como melhorias futuras, sem inventar novas frentes**.
- **Homologação severa com toda a equipe será feita depois**, usando o portal real, e corrigiremos apenas bugs/regressões identificados nesse teste. Não classificar como "pendente por defeito" algo já testado/aprovado.

## 1. PDFs do Jornal Online: armazenamento independente
- Proprietário **considera** criar **uma segunda conta Cloudflare R2** só para PDFs, para não consumir o espaço/franquia da conta usada para imagens do portal. **A escolha ainda não foi tomada; NÃO criar conta, bucket, token, subdomínio ou migrar arquivos automaticamente.**
- Já existia uma decisão antiga de **bucket exclusivo na mesma conta**, `jornal-ir-edicoes`, e implementação em `apps/sistema/src/providers/r2/editionArchive.r2.ts` que aceita `R2_EDITIONS_BUCKET`, `R2_EDITIONS_ACCESS_KEY_ID`, `R2_EDITIONS_SECRET_ACCESS_KEY`, `R2_EDITIONS_PUBLIC_BASE_URL`. Esse desenho separa arquivos/permissões, **mas não a franquia da conta**.
- **Se optar por conta R2 distinta**, o cliente S3 de edições precisará de **endpoint próprio** (atualmente usa `R2_ENDPOINT` comum com fotos), além de token, bucket, domínio público/CORS exclusivos. Nunca sobrescrever `R2_ENDPOINT` nem credenciais das fotos. Testar upload privado, HEAD, capa, download/Range e reader antes da ativação.
- A tabela `public.newspaper_editions` estava vazia (0 registros) na consulta de 04/11/2026. O acervo legado/fallback permanece e não deve ser desativado sem importar e validar as edições oficiais.
- Quando a conta/bucket ficar decidido, **primeiro** validar um PDF real por fluxo de homologação, **depois** considerar migração em lote. Nenhum upload ou alteração no R2 foi autorizado nesta conversa.

## 2. Página SOBRE e Assine
- **Decisão:** a página `/sobre` é institucional, para contar a **história, origem, trajetória e importância regional do jornal**, e **NÃO deve levar o leitor para `/assine`**. Preservar dados históricos verdadeiros e a identidade da marca; **não inventar data de fundação, marcos ou personagens** sem fonte.
- **Achado confirmado no código em 04/11:** `apps/site/src/app/(public)/sobre/page.tsx` contém texto de apresentação genérico e botão `Assine ou anuncie` com `href="/assine"`. Ainda precisa ser ajustado. Recuperar o texto histórico aprovado (repositório/histórico editorial) antes de refazer o conteúdo; não substituir por marketing novo. O botão de assinatura deve ser removido da página Sobre (não simplesmente escondido conforme estado).
- `/assine` é **função independente** que o administrador já pode ativar/desativar no painel. A flag `site_offer_settings.assine_enabled=false` foi observada em 04/11, portanto o 404 da rota `/assine` quando desligada é comportamento esperado.
- **Exigência:** quando o administrador ativar Assine, o formulário e o envio de solicitações devem funcionar de ponta a ponta; quando desativar, o público não deve conseguir utilizá-los. Não confundir flag desligada com módulo incompleto e não realizar teste transacional com dados de clientes reais sem planejamento.

## 3. Jornal Online — rótulos técnicos
- A remoção dos rótulos `Acervo`/`Acervo Drive` (expostos ao leitor em `dateLabel`) **já foi implementada**, na **PR #21** (base histórica separada), mas **NÃO está incorporada** no commit do portal publicado `0df90b459adde7a10a39d7260199f0dd048a1263`, tampouco na branch de trabalho conferida em 04/11. A PR #21 permanece draft/open.
- Quando fizer este hotfix, portar **apenas as alterações pontuais nos dois arquivos** `apps/site/src/components/site/calameoEditions.ts` e `apps/site/src/app/api/jornal-online/drive/route.ts`, sem aplicar cegamente a PR original #8 ou sobrescrever a mesclagem de acervos R2/Drive/estáticos.
- Manter URLs e comportamento da leitura/download. Validar visualmente antes de declarar publicado.

## 4. Notificações
- **Proprietário confirmou em 04/11 que notificações já foram testadas e funcionam corretamente.**
- Status: **ACEITO / SEM PENDÊNCIA ATUAL** enquanto o código e integrações permanecerem sem mudanças. Não reabrir investigação ou testes como tarefa obrigatória só por constarem em documentação anterior. Testar de novo somente se houver regressão, novo aparelho relevante ou alteração de implementação.

## 5. Aparência e QA geral
- **Proprietário aprovou o estado visual atual do site.** Deixar ajustes estéticos/gosto como backlog não urgente e sugerir somente se aparecerem questões objetivas na utilização.
- Mais tarde a equipe inteira fará **testes rigorosos do portal**, cobrindo dispositivos, navegação, notícias, Jornal Online, compartilhar e, quando ativo, Assine. Registrar problemas concretos com reprodução e corrigir por prioridade. **Não interromper o trabalho atual para iniciar testes novos sem necessidade.**

## Controle de alterações / deploy
- Esta nota **não autoriza** nova conta R2, upload/migração, aplicação de migration, ativação do Assine, envio de notificações ou publicação de nova versão.
- Alterações futuras no portal devem ser isoladas, testadas e comparadas com o código realmente publicado; respeitar a aprovação visual, especialmente da página Sobre e do leitor do Jornal Online.
- **WhatsApp de atendimento** continua suspenso e é uma pendência do ecossistema geral, **não uma pendência do portal**.
