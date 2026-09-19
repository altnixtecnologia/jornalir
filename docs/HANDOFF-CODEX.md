# Handoff — JornalIR

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
