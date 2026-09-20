# Handoff — JornalIR

## Fase 06 — cadastro e edição de matéria (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d70d867` (commit da Fase 05).
- Entrega: `/sistema/editorial/materias/nova` e `/sistema/editorial/materias/[id]` passam a ser um formulário real, usando `ArticleService` por Server Actions. Nenhuma página importa `@ir/mocks` diretamente.

### Por que Server Actions

O domínio editorial é mock em memória, sem banco. Se o formulário (client
component) chamasse `ArticleService` diretamente pelo navegador, o
`composition/editorial.ts` seria avaliado uma vez no bundle do servidor (usado
pelas páginas) e outra vez no bundle do navegador (usado pelo formulário),
criando dois estados divergentes do mesmo "banco" mock. Server Actions
(`"use server"`) executam no mesmo processo Node dos Server Components, então
`actions.ts` chama `articleService` diretamente e mantém um único estado
consistente — a listagem criada na Fase 05 reflete imediatamente o que o
formulário grava.

### `packages/core` e `packages/mocks` — extensão mínima

- Novo `MediaAssetRepository`/`MediaAssetService` (somente `list`/`getById`, sem criação/upload) em `packages/core/src/editorial/`, simétrico aos repositórios de editoria/localidade já existentes. Necessário para a biblioteca de mídia do formulário sem importar `mediaAssets` de `@ir/mocks` diretamente na página.
- Novo `createMediaAssetRepositoryMock` em `packages/mocks/src/editorial/`, reaproveitando os `mediaAssets` já cadastrados na Fase 04.
- `ArticleService` **não foi alterado** — toda a composição de ações (criar como programada, reverter para rascunho, etc.) acontece na camada de Server Action, reaproveitando `saveDraft`/`updateDraft`/`publishNow`/`schedule`/`archive` como já existiam.
- `composition/editorial.ts` ganhou `mediaAssetService`.

### `apps/sistema` — novos arquivos

- `app/sistema/editorial/materias/actions.ts` (`"use server"`): `createArticle`, `updateArticle`, `archiveArticle`. Validam (`validateArticlePayload`, compartilhada com o formulário), chamam os métodos do `ArticleService`, revalidam a listagem e o detalhe (`revalidatePath`) e redirecionam para `/sistema/editorial/materias/[id]` ao final. Identidade simulada fixa (`editor-sistema` / `editorial`), sem autenticação real.
- `features/editorial/ArticleForm.tsx` (client component): usado em criação e edição. Seções: Identificação (título/subtítulo com aparência editorial, referência interna somente leitura), Conteúdo, Classificação (editoria obrigatória, localidade), Exposição editorial (posição/destaque com janela opcional — não altera a editoria), Publicação (status atual informativo + data/hora de programação). Ações: Salvar rascunho, Publicar agora, Programar e, somente em edição, Arquivar (com confirmação).
- `features/editorial/ArticleBodyEditor.tsx`: textarea isolada em componente próprio — seam preparado para um editor rico futuro sem alterar o restante do formulário.
- `features/editorial/ArticleMediaPicker.tsx`: capa (com remoção), galeria ordenável (mover para cima/baixo, remover) e biblioteca de mídia mock com "Definir como capa"/"Adicionar à galeria". Sem upload — apenas seleção do catálogo existente.
- `features/editorial/articleMediaState.ts`: funções puras (`setCoverMedia`, `removeCoverMedia`, `addGalleryMedia`, `removeGalleryMedia`, `moveGalleryMedia`) que mantêm no máximo uma capa e reindexam a ordem da galeria a cada mudança.
- `features/editorial/articleFormTypes.ts`: `ArticleFormPayload`, `ArticleFormIntent` e `validateArticlePayload` — compartilhados entre o formulário (feedback imediato) e a Server Action (defesa em profundidade).
- `lib/datetimeLocal.ts`: conversão entre ISO e o formato de `<input type="datetime-local">`.
- `materias/nova/page.tsx` e `materias/[id]/page.tsx` reescritas: buscam editorias/localidades/mídias via composição e renderizam `ArticleForm` (`mode="create"` ou `mode="edit"`); `[id]` converte `ArticleNotFoundError` em `notFound()`, como na Fase 05.
- CSS novo em `globals.css` para o formulário e o seletor de mídia (`.article-form`, `.form-section`, `.field-title-input`/`.field-subtitle-input` com tipografia editorial, `.form-actions`, `.media-picker`, `.gallery-list`, `.library-grid`), mesma linguagem visual do shell, sem Tailwind e sem biblioteca de UI nova.

### Regras aplicadas na composição das ações

- "Salvar rascunho" sempre define `status: "draft"` e limpa `publishedAt`/`scheduledAt` — mesmo a partir de uma matéria publicada, garantindo que rascunho nunca publica.
- "Publicar agora" e "Programar" persistem primeiro os campos editados (`updateDraft`) e só então chamam `publishNow`/`schedule`; ao criar uma matéria já publicando/programando, `saveDraft` roda primeiro (sempre como rascunho, por contrato do `ArticleService`) e a transição de status é a chamada seguinte — nunca pulando o rascunho intermediário.
- "Programar" sem data/hora é rejeitado antes de chamar o service (client e Server Action).
- Destaque (`placement`) nunca inclui `sectionId` — a UI nem oferece esse campo dentro da seção de exposição editorial.
- "Arquivar" só aparece quando `mode === "edit"`.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/materias/nova` e `/materias/[id]` cresceram (Server Actions incluídas no bundle) mas sem erros.
- Validação de negócio (não apenas compilação): script `tsx` temporário (removido ao final, nunca commitado) compôs `ArticleService`/`EditorialSectionService`/`LocalityService` com os mesmos mocks da composição real e exercitou, com asserções, os 19 comportamentos-chave: criação sempre como rascunho, referência gerada automaticamente, edição altera campos, capa exclusiva, galeria mantém ordenação, destaque não altera editoria, publicar agora grava `publishedAt`, salvar rascunho reverte status e limpa datas, programar exige e grava `scheduledAt`, arquivar define `archived`, criação direta como programada (create+schedule), e rejeição de editoria inexistente. Todas as 19 asserções passaram.
- Validação de renderização real: servidor de produção local (`next start`, porta 3001) — `/materias/nova` 200 com os 9 itens da biblioteca de mídia listados; `/materias/article-1245` (publicada, com galeria) 200 com capa e as 2 imagens de galeria corretas, seletor de destaque pré-selecionado em "mainHighlight", status "Publicada"; `/materias/article-1243` (rascunho sem imagem) 200 com os estados vazios corretos ("Nenhuma capa selecionada", "Nenhuma imagem na galeria"); `/materias/nao-existe` 404. Servidor encerrado ao final.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- Corpo da matéria é uma textarea simples (isolada em `ArticleBodyEditor` para facilitar a troca futura por um editor rico); título/subtítulo têm aparência editorial (Georgia serif) mas sem controles de formatação pontual ainda.
- Sem upload real: a galeria/capa só pode usar as 9 mídias mock já cadastradas na Fase 04.
- Sem confirmação de saída ao navegar para fora do formulário com alterações não salvas — não solicitado nesta fase.
- Identidade/ator continua simulada (`editor-sistema`); nenhuma auditoria é persistida (consistente com a decisão da Fase 04).

### Próxima fase

Importação de PDF (candidatos, revisão, mesclar/dividir, vínculo com edição) **ou** evolução do editor de texto (formatação básica: negrito, itálico, listas, links, citações) — a decidir. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 05 — lista de matérias (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `41d58151c587e980497f752ecd72772c1ccb9d1e` (commit da Fase 04).
- Entrega: primeira tela real do CMS, ligando a UI ao domínio editorial composto na Fase 04. Sem editor completo.

### Rotas criadas

- `apps/sistema/src/app/sistema/editorial/materias/page.tsx` — Server Component assíncrono; busca `articleService.list()`, `editorialSectionService.list()` e `localityService.list()` via `composition/editorial.ts` (nenhuma fixture de `@ir/mocks` importada na página) e renderiza `ModuleHeader` + `MateriasList`.
- `apps/sistema/src/app/sistema/editorial/materias/[id]/page.tsx` — detalhe somente leitura; usa `articleService.getById`, converte `ArticleNotFoundError` em `notFound()`. Mostra referência, editoria, localidade, status, destaque, notificação, mídia, origem, datas e responsável. Cobre as ações "Abrir" e "visualizar estado" sem ser um editor.
- `apps/sistema/src/app/sistema/editorial/materias/nova/page.tsx` — stub da ação "Nova matéria", reaproveitando `EmptyModuleState` para deixar claro que o formulário completo é uma etapa futura.

### Componentes e suporte

- `apps/sistema/src/features/editorial/MateriasList.tsx` (client component) — filtros de busca por texto (título/subtítulo/referência), status, editoria e localidade, aplicados sobre a lista já carregada pelo Server Component (sem chamar os services novamente a cada filtro). Tabela densa (sem cards) com referência, matéria, editoria, localidade, status, publicação/programação, destaque, notificação, indicação de imagem/capa e ação "Abrir".
- `apps/sistema/src/features/editorial/editorialLabels.ts` — mapas de rótulo em português para `ArticleStatus`, `EditorialPlacementType` e `NotificationMode`, e helpers de formatação de data/mídia. Fica na camada de UI, não em `packages/types` ou `packages/core`.
- `EditorialOverview.tsx` atualizado: aviso não fala mais em "próxima etapa" para a listagem (que já existe) e ganhou o link "Ver matérias" para `/sistema/editorial/materias`.
- `globals.css`: novo bloco de estilos próprios do shell (toolbar de filtros, tabela, `status-pill`/`placement-pill`/`notification-pill`, indicador de mídia, layout de detalhe com `meta-list`, `header-action`), sem Tailwind e sem `@ir/ui` — mantém a mesma linguagem visual (papel claro/verde escuro/tipografia editorial) das telas da Fase 03.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/sistema/editorial/materias` e `/sistema/editorial/materias/nova` pré-renderizadas como estáticas, `/sistema/editorial/materias/[id]` como dinâmica.
- Servidor de produção iniciado localmente (`next start`, porta 3001) só para validação e encerrado ao final: `/sistema/editorial/materias` → 200 com as 7 referências mock (`IR-MAT-2026-001240`…`001246`) e contagem de status batendo com os fixtures (2 rascunho, 1 em ajuste, 1 programada, 3 publicadas); `/sistema/editorial/materias/article-1241` → 200, mostrando corretamente "Urgente" e "Notificação urgente"; `/sistema/editorial/materias/nao-existe` → 404 (via `notFound()`); `/sistema/editorial/materias/nova` → 200.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- "Abrir" leva a uma visualização somente leitura do estado da matéria, não a um editor; "Nova matéria" leva a um stub explicando que o cadastro completo é uma etapa futura — ambos evitam sugerir uma funcionalidade que não existe ainda.
- Filtros são client-side sobre a lista completa já carregada (adequado ao volume de dados mock atual); quando houver paginação/backend real, a filtragem deve migrar para os repositórios/serviços.
- Nenhuma alteração em `packages/types`, `packages/core` ou `packages/mocks` nesta fase — a fase foi puramente de consumo da composição já existente.

### Próxima fase

Lote 2 (continuação) — cadastro/edição de matéria usando `articleService.saveDraft/updateDraft/publishNow/schedule`, escolha de capa/galeria, padrão editorial de título/subtítulo/texto, destaque e notificação. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 04 — domínio editorial (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `2bf8a7e272a6f9aa0797261f635ee07f309357f8` (nenhum commit próprio da branch existia ainda; Fases 1–3 estavam integralmente pendentes de commit).
- Entrega: fundação de domínio editorial sem banco real, sem autenticação e sem ampliar o frontend.

### `packages/types`

Novo módulo `src/editorial/` (reexportado em `src/index.ts`, tipos legados preservados sem alteração): `UserRole`, `ArticleStatus`, `NotificationMode`, `LocalityScope`, `Locality`, `EditorialSection`, `EditorialPlacementType`, `EditorialPlacement`, `MediaAsset`, `ArticleMediaRole`, `ArticleMedia`, `ArticleOrigin`, `Article`, `NewspaperEdition`, contratos mínimos de importação de PDF (`ImportCandidateStatus`, `ImportCandidate`) e contexto de auditoria (`AuditContext`, `AuditEvent`).

Regras aplicadas: `Article.sectionId` é obrigatório; `Article.localityId` é obrigatório e independente da editoria (uma localidade com `scope: "general"` representa "Região"); `subtitle` e mídia são opcionais; `ArticleMedia.role` distingue `cover` de `gallery`, com `order` para reordenação; `placement` nunca substitui `sectionId`; `origin: "pdfImport"` só é usado por fluxos que sempre resultam em `status: "draft"`.

### `packages/core`

Novo pacote `@ir/core` (dependência: `@ir/types`), com `src/editorial/`:

- `ArticleRepository`, `EditorialSectionRepository`, `LocalityRepository` — contratos puros, sem React/IndexedDB/Supabase.
- `ArticleService` — `list`, `getById`, `saveDraft`, `updateDraft`, `publishNow`, `schedule`, `archive`, `importAsDraft`; valida existência de editoria/localidade antes de gravar; publicação e programação são sempre chamadas explícitas; todo método recebe `AuditContext` (não persistido nesta fase — apenas para não inviabilizar auditoria futura).
- `EditorialSectionService`, `LocalityService` — `list`/`getById` simples.

Fluxo respeitado: `UI → Service → Repository → Provider`.

### `packages/mocks`

Novo módulo `src/editorial/` (reexportado em `src/index.ts`; dados legados de notícias/patrocinadores/anúncios preservados). `data.ts` traz 5 editorias, 4 localidades, 8 mídias, 1 edição impressa e 7 matérias cobrindo: publicada (com manchete e com destaque principal), programada, rascunho, em ajuste, com e sem imagem, galeria (múltiplas imagens com capa definida), diferentes editorias e localidades, urgente e matéria importada de PDF vinculada a uma edição (`editionId` + `editionPageNumber`).

`article-repository.mock.ts`, `editorial-section-repository.mock.ts` e `locality-repository.mock.ts` exportam fábricas (`createXRepositoryMock`) que implementam os contratos de `@ir/core` sobre cópias em memória dos dados acima; o estado dura apenas a instância criada, sem persistência real.

### `apps/sistema`

Novo `src/composition/editorial.ts`: ponto de composição único ligando `MockRepository → Service` (`articleService`, `editorialSectionService`, `localityService`). Não é consumido por nenhuma tela nesta fase — nenhuma UI nova foi criada, conforme escopo da Fase 04.

Adicionado `@ir/core` às dependências de `apps/sistema/package.json` e a `transpilePackages` de `apps/sistema/next.config.mjs`. Adicionado o path `@ir/core` em `tsconfig.base.json`. Rodado `npm install` na raiz para registrar o novo workspace (symlink em `node_modules/@ir/core` e entrada em `package-lock.json`).

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 16 rotas geradas (inclui `/sistema/editorial` e módulos placeholder).
- `npm run typecheck --workspace @ir/site`: sem erros — confirma que os novos tipos/pacotes compartilhados não quebraram o portal, o IndexedDB atual, o flipbook nem o jornal digital.
- Nenhum teste funcional em navegador nesta fase (não há UI nova consumindo o domínio editorial ainda).

### Pendências e decisões

- `packages/mocks` e `packages/core` passaram a declarar `dependencies` explícitas para os pacotes `@ir/*` que efetivamente usam (`packages/types`, `packages/config` e `packages/ui` legados não declaravam essas dependências entre si; a resolução funcionava apenas via symlink de workspace). Convenção não retroaplicada aos pacotes antigos nesta fase.
- O commit desta fase também inclui documentação do Lote 1 (Partes A–T do Plano Mestre, `ARCHITECTURE.md`, `FRONTEND-STRUCTURE.md`, `DATA-BOUNDARIES.md`, `CURRENT-STATE.md`, scripts 01/02) e o shell administrativo da Fase 03, pois nenhuma dessas fases tinha sido commitada até agora nesta branch. `HEAD` da branch, portanto, salta diretamente de `main` para o commit consolidado desta rodada.
- Rotas `/sistema/editorial/materias`, `/programacao`, `/importar-pdf`, `/editorias`, `/localidades`, `/midias` continuam não implementadas — previstas para o próximo lote (CMS completo), que consumirá `articleService`/`editorialSectionService`/`localityService` do ponto de composição criado aqui.
- Como no domínio ainda não há telas, o comportamento observável do sistema não mudou nesta fase; a entrega é estrutural.

### Próxima fase

Lote 2 — CMS editorial completo: telas de listagem/filtro de matérias, cadastro/edição usando os serviços já compostos, escolha de capa/galeria, programação, destaque e notificação. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 03 — shell administrativo (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- SHA base: `2bf8a7e272a6f9aa0797261f635ee07f309357f8`.
- Entrega: layout administrativo persistente, menu completo, navegação ativa, cabeçalho, Início, apresentação Editorial e páginas explícitas de módulos planejados.
- Linguagem visual: papel claro, verde escuro, tipografia de leitura com títulos editoriais, divisores e listas. Sem métricas fictícias, dependência de fontes remotas ou biblioteca de UI nova.
- Componentes locais em `apps/sistema/src/components/admin`; conteúdo editorial em `features/editorial`; mapa tipado de módulos em `lib/navigation.ts`.
- Menu móvel usa `dialog` nativo, fechamento por Escape, navegação ou botão e gerenciamento nativo de foco; há link para pular ao conteúdo e foco visível.
- Rotas antigas de anúncios/patrocinadores continuam com suas operações em memória, agora dentro do shell e com aviso sobre dados temporários. Nenhuma função de publicação foi simulada.
- A correção da Fase 02 não estava aplicada nesta cópia: `basePath: "/sistema"` ainda existia. Foi removido como pré-requisito mínimo, mantendo `app/sistema` e os links `/sistema/...`. Nenhum script das fases anteriores foi executado.
- `Ver portal` preserva o acesso externo; usa `NEXT_PUBLIC_SITE_URL` quando configurado e `http://localhost:3000` como padrão local. Nenhum arquivo de ambiente foi alterado.
- Script fornecido salvo em `automation/scripts/03-shell-administrativo.ps1`, com modos `Preflight` e `Finalizar`, sem mudanças no conteúdo funcional. Preflight aprovado na branch esperada.
- Sem alterações em `apps/site`, pacotes compartilhados, backend, dependências do projeto ou stack. Fase 04 não iniciada.
- Ferramentas temporárias de revisão: Prettier e agent-browser via cache npm, sem alteração de manifests/lockfile.
- Revisão React: páginas permanecem componentes de servidor, exceto os pequenos componentes interativos de navegação; sem importação de arrays de dados de negócio nas telas novas, sem `any` novo e sem efeitos desnecessários.

### Validação e finalização

Em andamento: validação visual, typecheck e build antes do commit. A inicialização local do Next levou 134,7 segundos. Uma tentativa de typecheck durante a geração dos arquivos `.next/types` encontrou TS6053 (arquivos gerados ausentes); a validação final será executada com o servidor encerrado para evitar concorrência sobre esse diretório.

### Próxima fase

Fase 04 — domínio editorial, contratos e mocks. A apresentação Editorial desta fase não oferece cadastro, edição ou publicação de matérias. Módulos planejados não executam operações reais. Aguardar autorização para a Fase 04.

---

# Histórico — rodada documental

## Identificação

- Data: 17/09/2026.
- Escopo entregue: documentação e organização arquitetural, parte do Lote 1.
- Branch: `feature/jornalir-core-foundation-20260917`.
- Base: `main`, SHA `2bf8a7e272a6f9aa0797261f635ee07f309357f8`.
- SHA final: sem novo commit nesta parte; HEAD permanece no SHA base. Documentos locais ainda não rastreados.
- Lote 1 completo: pendente. Não avançar sem autorização para a próxima parte.

## Entregas

- `CURRENT-STATE.md`: fotografia objetiva e limitações do levantamento.
- `ARCHITECTURE.md`: arquitetura-alvo e princípios do núcleo editorial.
- `FRONTEND-STRUCTURE.md`: responsabilidades, classificação e recomendação para rotas.
- `DATA-BOUNDARIES.md`: separação UI → service → repository → provider.
- Este `HANDOFF-CODEX.md`: registro inicial da rodada.
- `PLANO-MESTRE-JORNALIR.md`: cópia anterior do anexo, preservada sem reescrita; igualdade SHA-256 com a fonte conferida.

Preservados também `PROMPT-MESTRE-CODEX-JORNALIR.md`, o resumo `../REESTRUTURACAO-PROJETO-GPT.md` e os dois documentos históricos de banco. Nenhum arquivo funcional ou configuração foi alterado.

## Decisões propostas

Manter o monorepo e as versões atuais. Portal será exclusivamente público; sistema concentrará CMS/administração. Domínio em `types`, serviços/repositórios em `core` se necessário, implementações simuladas em `mocks`, componentes realmente comuns em `ui`.

Preservar funções úteis sem impor o visual antigo ao redesign. Preservar jornal digital/Drive/flipbook e administração legada até a substituição planejada. Supabase exclusivo do JornalIR será futuro provider e fonte de dados comum, sem conexão agora.

Para a duplicação de `/sistema`, recomendar remover futuramente `basePath` e manter `app/sistema`; revisar links e compatibilidade no mesmo trabalho técnico. Não foi corrigido nesta rodada.

## Verificação desta parte

- `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse main` e consulta de existência da branch antes de criá-la.
- Branch criada explicitamente do SHA base; a restrição de escrita em `.git` exigiu execução autorizada fora da restrição inicial.
- Leitura dos arquivos relevantes e consulta da documentação oficial do Next.js 14 para `basePath`.
- Revisão final dos cinco documentos novos, dos links Markdown locais, preservação dos documentos anteriores e estado Git.
- Nenhum build, typecheck, servidor, teste funcional ou instalação: mudanças exclusivamente documentais.
- Sem dependências novas, commit, push, merge, deploy ou integração operacional.

## Problemas preexistentes e riscos

- Mocks de administração em memória e IndexedDB do portal são fontes independentes.
- Categorias fixas e tipos antigos não cobrem o novo domínio; trocar tipos sem adaptação pode quebrar o portal.
- Páginas ADMIN permanecem no portal: matérias, anúncios e configurações do site.
- Possível prefixo duplicado de rota, ainda sem validação em navegador.
- Documentos históricos de banco divergem em detalhes do Plano Mestre; não os executar como especificação definitiva.
- O Git avisou que não pôde ler o ignore global do usuário; as consultas ao repositório funcionaram.
- Funcionamento atual de build, telas e integrações não foi validado nesta parte.

## Continuidade

Próxima pequena parte sugerida, após autorização: corrigir de forma isolada a organização de `/sistema`, preservando anúncios/patrocinadores e validando navegação. Depois, implementar contratos editoriais e a camada mock antes de ampliar telas.

Ainda pertencem ao Lote 1: domínio tipado, serviços/repositórios, mocks editoriais, novo layout administrativo, listagem/filtros, cadastro inicial e páginas auxiliares, com validação ao fechar os blocos funcionais.

Lote 2 continua reservado para CMS completo, editor e operações avançadas de imagens, preview e transições. Supabase, autenticação real, OCR, financeiro completo, integrações e redesign do portal permanecem fora da parte atual.

Ao retomar, ler Plano e Prompt Mestre, conferir branch/status e preservar os arquivos locais. Não interpretar esta documentação como autorização para implementar a próxima parte. Parar ao concluir a rodada documental e aguardar o usuário.
