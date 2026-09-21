# Handoff — JornalIR

## Fase 24 — providers reais: editorias + localidades (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d6a8a9e` (commit da Fase 23).
- Entrega: `apps/sistema` passou a ler/gravar `editorial_sections` e `localities` direto no Supabase (`site-system-ir`), mantendo a camada `UI → Service → Repository Contract → Supabase Provider`. Matérias, mídias e PDF continuam mock nesta fase (só as duas telas/entidades pedidas). Owner/Auth não tocados.

### Arquitetura: de singleton para factory por requisição

`composition/editorial.ts` era só singletons módulo-level. Um provider Supabase real precisa do cliente autenticado da requisição (`createSupabaseServerClient()` usa `cookies()` do Next.js, só existe dentro de Server Component/Action). Resolvido trocando `editorialSectionService`/`localityService`/`articleService`/`importCandidateService` por factories (`getEditorialSectionService(client)`, etc.) — `mediaAssetService`/`newspaperEditionService` continuam singleton (ainda mock). Isso cascateou para 10 arquivos de tela/action que precisaram passar a construir `createSupabaseServerClient()` e chamar a factory em vez do import direto do singleton.

### Providers novos

`apps/sistema/src/providers/supabase/editorialSectionRepository.supabase.ts` e `localityRepository.supabase.ts`, implementando os contratos de `@ir/core` (`EditorialSectionRepository`/`LocalityRepository`), com mapeamento `sort_order` (DB) ↔ `order` (domínio) isolado no provider — nenhuma UI sabe o nome real da coluna.

### Divergência conhecida (documentada, não corrigida — "não mudar schema sem necessidade")

`EditorialSection.description` existe no tipo de domínio mas não tem coluna em `editorial_sections` — o provider real simplesmente não persiste esse campo (mock ainda persiste, então isso só é visível depois da migração real). `Locality` no domínio não expõe `order`/`parent_id`, embora a tabela tenha `sort_order`/`parent_id` — colunas existentes, só não mapeadas ainda.

### Teste de persistência real (contra `site-system-ir`, dados removidos ao final)

Sem sessão de owner disponível neste ambiente para testar pelo navegador (mesma limitação da Fase 21), a persistência foi validada direto no banco via `supabase db query --linked`: criado `editorial_sections`/`localities` com prefixo `qa-fase24`, editado (nome + `active=false`), depois apagado — `count()` confirmado igual ao original (7 editorias, 4 localidades) antes e depois. RLS/owner intocados: 32 policies antes e depois, owner continua `role=owner active=true`. `/sistema/editorial/editorias`, `/localidades` e `/materias` continuam redirecionando (307) para `/login` sem sessão, confirmado via `curl`.

### Validação (build/typecheck)

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sem erros, 25 rotas (inalterado).
- `apps/sistema`/`apps/site` já estavam rodando localmente (`http://localhost:3001`/`3000`).

### Pendências e decisões

- Teste de login real do owner pelo navegador (criar/editar/desativar pela UI de verdade) não executado — sem credenciais neste ambiente; só validação no nível do banco.
- `ArticleService` (matérias) continua com repositório mock — próxima migração de provider natural, incluindo `article_placements`.
- Mocks de editorias/localidades (`@ir/mocks`) não foram removidos — continuam existindo, só não são mais usados pela composição do `apps/sistema`.

### Próxima fase

A decidir pelo usuário — caminhos possíveis: migrar o provider de Matérias (`ArticleRepository` real), depois Mídias/Importação de PDF; uma tela de gestão de posições editoriais; ou seguir para `apps/site`. Detalhe em `docs/DATABASE-IR-CORE.md` (seção 13).

---

## Fase 23 — migration real dos destinos editoriais (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `b35af5b` (commit da Fase 22).
- Entrega: o modelo de destinos editoriais consolidado na Fase 22 (`packages/types`/`core`/`mocks`) agora existe de verdade no banco `site-system-ir` — duas migrations aplicadas e validadas com testes reais (com limpeza total dos dados de teste). Owner/Auth (Fases 20/21) não foram tocados, como instruído.

### Bloqueio de sessão da CLI — resolvido de um jeito novo desta vez

A sessão expirou de novo no início da fase (`Unauthorized` em `projects list`/`link`, mesmo padrão das vezes anteriores). Desta vez a causa era diferente: o token não vive em `~/.supabase` (onde as fases anteriores o encontraram) — está salvo como variável de ambiente **persistente do usuário Windows** (`SUPABASE_ACCESS_TOKEN`, via `[Environment]::SetEnvironmentVariable(...,"User")`), que não é herdada automaticamente por um processo novo do Bash tool. Resolvido carregando explicitamente no início de cada chamada PowerShell: `$env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN","User")` — sem nunca imprimir o valor, sem `supabase login`, sem procurar em `~/.supabase`. Repetido em toda chamada `supabase` desta fase (o PowerShell tool não persiste estado de shell entre chamadas).

### Diagnóstico read-only antes de escrever a migration (item 1 da fase)

`select count(*) from articles` → 0. `select count(*) from article_placements` → 0. `select distinct type from article_placements` → vazio. Sem dado real de nenhum tipo antigo (`headline`/`primary`/`secondary`/`breaking`/`section`/`special`) para mapear ou perder — migration segura de escrever e aplicar sem qualquer heurística de conversão.

### Duas migrations aplicadas (a segunda corrigindo um achado real da primeira)

1. `20260924100000_editorial_placement_model.sql` — novo vocabulário de `type` (4 valores, `none` nunca vira linha); `article_placements.pinned` + constraint declarativa (só `mainCover`); `articles.urgent`; função+trigger `enforce_placement_limit()` (8/3/7/4, fixadas nunca evictadas mas sempre ocupam vaga, excesso volta para `active=false`, nunca `DELETE`, `pg_advisory_xact_lock` por tipo de posição para concorrência).
2. `20260924100100_editorial_placement_deterministic_tiebreak.sql` — **achado real durante o próprio teste desta fase**: testar em lote (várias inserções numa única transação) revelou que `created_at` é idêntico entre linhas da mesma transação (`now()` estável por transação no Postgres), e o `ORDER BY created_at desc` sem desempate escolhia uma linha arbitrária para evictar — violando a exigência explícita de ordenação determinística. Corrigido com `order by created_at desc, id desc`. Documentado em detalhe em `docs/DATABASE-IR-CORE.md` (seção 10) para não ser redescoberto — e como lembrete de que "nunca alterar migration já aplicada" vale desde o primeiro minuto, inclusive dentro da mesma sessão: a correção virou uma migration nova, não uma edição da primeira.

### Testes reais contra o banco (não só leitura de schema — escrita, verificação, limpeza)

Diferente das fases anteriores (bloqueadas em escrita por `auth.users`), escrever em `articles`/`article_placements` **não foi bloqueado** pelo classificador do ambiente — são tabelas de negócio comuns, não o sistema de autenticação. Sequência: inserir 8 `mainCover` (uma primeira rodada em lote, que expôs o achado do desempate — revertida/limpa antes da correção), reaplicar com a função corrigida, inserir 8 em transações **separadas** (gaps reais de ~1,1s via `Start-Sleep`) para confirmar `created_at` genuinamente distintos, inserir a 9ª e confirmar que a evicção pega exatamente a mais antiga (não mais uma escolha arbitrária). Preencher as 8 vagas de `mainCover` com fixadas e confirmar que uma 9ª fixada é rejeitada com mensagem clara, sem criar linha. Testar `highlightStrip` com 4 entradas → só 3 ativas. Testar rejeição de `pinned` fora de `mainCover` e de `type='headline'`. Confirmar que o artigo evictado mantém `status`/`section_id`/`locality_id` idênticos. Confirmar 32 policies antes/depois (nenhuma perdida), RLS habilitada nas duas tabelas, e — sem tocar — exatamente 1 `profile` `role='owner'`/`active=true`. Toda linha de teste (`slug like 'qa-fase23%'`) removida ao final; confirmado `0` restantes.

**Limite desta validação**: a trava de concorrência (`pg_advisory_xact_lock`) foi revisada estruturalmente (padrão recomendado do Postgres para este problema) mas não testada com duas transações genuinamente simultâneas — as chamadas desta sessão são sequenciais. Documentado como pendência, não um problema encontrado.

### Validação (build/typecheck)

- `npm run typecheck`/`build --workspace @ir/sistema`: sem erros, 25 rotas (inalterado — nenhum código de app tocado nesta fase, só migrations).
- `npm run typecheck`/`build --workspace @ir/site`: sem erros, 22 rotas (inalterado).
- `apps/sistema`/`apps/site` rodando localmente durante toda a fase (`http://localhost:3001`/`http://localhost:3000`), sem reinício necessário (nenhuma mudança de código).
- Owner/Auth confirmados intocados: mesmo `id`, mesmo `role`, `active=true`, nenhuma tentativa de `UPDATE`/`DELETE` nele.
- Nenhum secret impresso em log — só o comprimento do token (`44 caracteres`) foi mostrado, nunca o valor.

### Pendências e decisões

- Teste de concorrência real (duas transações simultâneas) não executado — ver "Limite desta validação" acima.
- `packages/core`/`ArticleService` continua sendo a fonte de verdade para `apps/sistema` (mock) — o banco agora tem a MESMA regra de negócio (8/3/7/4, pinned, urgent), mas os dois ainda não estão conectados; migração de provider é a próxima etapa relevante, não feita nesta fase.
- Nenhuma tela nova ou alterada — fase 100% de banco.

### Próxima fase

A decidir pelo usuário — caminhos possíveis: migração de provider do conteúdo editorial (`apps/sistema` primeiro, conectando ao banco que agora já tem o modelo certo), uma tela de gestão de posições editoriais, ou seguir para `apps/site`. Detalhe em `docs/DATABASE-IR-CORE.md` (seção 11).

---

## Fase 22 — consolida destinos editoriais e editor de matérias (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `33afedf` (commit da Fase 20) + correção pontual da logo do header (não commitada antes desta fase, incluída aqui).
- Entrega: as 7 posições editoriais ambíguas (`headline`/`mainHighlight`/`secondaryHighlight`/`urgent`/`sectionHighlight`/`special`) viram 5 destinos reais (`none`/`mainCover`/`highlightStrip`/`latestNews`/`localSpotlight`), cada um mapeado a um bloco já existente do portal; `urgent` virou campo independente; rotação automática e determinística (8/3/7/4) com "fixar na capa" implementada e testada em `packages/core`; editor reorganizado; upload de fotos honesto sobre a limitação do provider mock; portal público com pequenos ajustes de limite/label alinhados ao novo modelo (sem migrar de provider). **Banco intocado** — nenhuma migration criada nem aplicada.

### `packages/types` — o novo vocabulário

`EditorialPlacementType`: `none | mainCover | highlightStrip | latestNews | localSpotlight` (era 7 valores, incluindo `urgent` misturado com posição visual). Novo `EDITORIAL_PLACEMENT_LIMITS` (8/3/7/4) exportado do pacote, única fonte de verdade do limite de cada posição — `ArticleService` importa de lá, não duplica o número. `EditorialPlacement` ganhou `pinned?`/`setAt?`. `Article` ganhou `urgent: boolean`, campo novo e obrigatório, deliberadamente separado de `notificationMode` (que continua existindo, sem mudança — é o tom de uma notificação push pontual, não um selo permanente da matéria).

### `packages/core` — rotação automática, testada

`ArticleService.updateDraft`/`schedule`: ao receber um `placement` novo, carimbam `setAt` só quando o `type` de fato muda (ajustar só `pinned` ou a janela de datas não "fura fila" na rotação), e chamam `enforcePlacementLimit` (privado) depois de qualquer posição não-`none`. Algoritmo: matérias fixadas nunca são evictadas mas sempre ocupam uma vaga; as vagas restantes até o limite vão para as definidas mais recentemente (`setAt` desc); o que sobra volta para `{type: "none"}` — nunca apagado, nunca muda `sectionId`/`localityId`/`status`. Novo `listActivePlacement(type, now?)`: só `status='published'`, respeitando `startsAt`/`endsAt`, ordenado por `setAt` — pronto para consumo futuro (nenhuma tela chama isto ainda; a UI do painel continua editando `placement` por matéria, não há uma "central de posições" nesta fase).

Validação: script `tsx` temporário (removido ao final, nunca commitado), reproduzindo os serviços reais da composição — **21/21 asserções**, cobrindo exatamente os itens pedidos: editoria/localidade preservadas ao entrar/sair de posição; matéria evictada nunca apagada, continua publicada; limite de 8 na capa (9ª entrada evicta a mais antiga não-fixada); fixada nunca expulsa mesmo com 8 novas entrando depois; nunca mais de 8 visíveis mesmo com fixadas somadas; limite de 3 na faixa; limite de 7 em Últimas notícias; agendada não aparece até a data chegar; limite de 4 em Nossa região; selecionar Nossa região não substitui a localidade; `urgent` não altera posição/editoria.

**Achado real corrigido durante a validação**: o mock `article-1240` (Capa principal, fixada) tinha um `endsAt` no passado (data fixa de uma fase anterior, ultrapassada pela passagem do tempo) — a janela expirada fazia `listActivePlacement` excluí-lo mesmo estando fixado, mascarando temporariamente a contagem correta no teste. Removido o `endsAt` desse registro (mantido só `startsAt`, sem prazo de fim) — não é um bug da lógica nova, é um lembrete de que datas fixas em mock "vencem" com o tempo; documentado aqui para não ser re-descoberto.

### `packages/mocks` — dados remapeados, nunca hardcoded na UI

7 artigos remapeados 1:1 para o novo vocabulário (nenhum article novo criado): `article-1240` → `mainCover` + `pinned: true` (demonstra fixar); `article-1241` → `highlightStrip` + `urgent: true` (demonstra os dois campos juntos, agora desacoplados); `article-1242` → `latestNews` (status `scheduled`, demonstra "agendada só entra quando publicada"); `article-1245` → `localSpotlight` (localidade real, Torres); os demais permanecem `none`. Todos os 7 ganharam `urgent` (campo agora obrigatório).

### `apps/sistema` — editor reorganizado

- `editorialLabels.ts`: `placementLabels` com os 5 nomes exatos pedidos (`Nenhuma`/`Capa principal`/`Faixa de destaques`/`Últimas notícias`/`Nossa região`); novo `placementDescriptions` (uma frase por posição, sem jargão, mostrada abaixo do select).
- `ArticleForm.tsx`: "Mais opções" reorganizada em três blocos separados — "Onde esta matéria aparece em destaque" (posição editorial + descrição + janela de datas), "Fixar na capa" (checkbox, só renderizado quando `mainCover` está selecionado), "Urgência e notificação" (checkbox "Marcar como urgente" + o select de notificação já existente, agora com contexto explícito de que são coisas diferentes). Novo `.form-checkbox` (CSS, alvo de toque 44×44px em mobile).
- `DestinoEditorial.tsx`: rótulo "Posição editorial" (era "Capa/destaque"), mostra "(fixada na capa)" quando aplicável, nova linha "Urgente" quando o selo está ativo.
- `MateriasList.tsx`: novo selo "Urgente" (badge vermelho) ao lado do título, tabela e cartões mobile — nada ficou sem representação visual.
- `ArticleMediaPicker.tsx`: nova seção "Adicionar fotos" no topo — botão "Enviar fotos" (abre seletor de arquivo real; ao escolher, mostra aviso honesto: "envio direto ainda não disponível, provider atual funciona por URL já hospedada — cadastre em Mídias e escolha da biblioteca", nunca finge sucesso) + texto explicando a regra 1 foto/2+ fotos; seção de biblioteca renomeada para "Escolher da biblioteca"; mensagem da galeria adaptada quando há só 1 foto ("galeria pública não aparece").
- `articleFormTypes.ts`/`materias/actions.ts`: `ArticleFormPayload` ganhou `pinned`/`urgent`; `buildPlacement` só aplica `pinned` quando `type === "mainCover"`; `createArticle`/`updateArticle` passam `urgent` para `saveDraft`/`updateDraft`.
- Logo do header corrigida nesta mesma fase (pedido à parte, incluído no commit): `logo-escrita.png` de `apps/sistema` era `Format24bppRgb` (fundo preto sólido, sem alfa — confirmado por pixel), substituída pela versão realmente transparente já usada em `apps/site` (só leitura lá); removida a "placa" preta (`background`/`padding`/`border-radius`) de `.app-brand`; altura `30px`→`40px` desktop, `22px`→`30px` mobile.

### `apps/site` — só o necessário para representar os limites (sem migrar provider)

Confirmado pelo mapeamento arquitetural desta fase: `apps/site` **não consome `packages/core`/`Article`** — tem seu próprio modelo paralelo (`NewsItem`/`SiteArticle`/`CmsNewsItem`, IndexedDB, campo `isFeatured: boolean` fazendo hoje o papel que `placement` faz no painel). Migrar isso de verdade é a integração de provider explicitamente fora de escopo. Ajustes feitos, alinhando só os **limites visuais** ao novo modelo:
- `page.tsx`: capa (`isFeatured`) de `.slice(0,5)` para `.slice(0,8)` (Capa principal); Últimas notícias de `.slice(0,8)` para `.slice(0,7)`; "Nossa região" já estava em 4, faixa de destaques já estava em 3 — sem mudança.
- `LatestNewsList.tsx`: novo marcador lateral (`border-left` vermelho) no bloco da matéria selecionada — "marcador lateral" era uma das opções explicitamente aceitas no pedido para deixar o item ativo visualmente evidente.
- `FeaturedHero.tsx`: nenhuma mudança de código necessária — os pontos de navegação (`hero-dot`) já eram genéricos (`.map` sobre `items`), suportam 8 sem overflow (confirmado: container sem `flex-wrap`, largura total ~112px mesmo com 8 pontos, cabe em qualquer viewport).

### Validação

- `npm run typecheck`/`build --workspace @ir/sistema`: sem erros, 25 rotas (inalterado).
- `npm run typecheck`/`build --workspace @ir/site`: sem erros, 22 rotas (inalterado).
- Servidor de desenvolvimento local (ambos apps): `/login`, `/sistema` (redireciona sem sessão, como esperado desde a Fase 20), `/` e `/noticias/[slug]` do portal — sem "Application error"/"Hydration failed"; classe `latest-news-active` e textos "Nossa região"/"Últimas notícias" confirmados na resposta HTML.
- `apps/site`: só os 3 arquivos citados acima tocados — nenhum outro comportamento (Jornal Online/flipbook/busca/anúncios) alterado.

### Pendências e decisões

- Nenhuma migration criada — a divergência com `article_placements` está documentada em detalhe em `docs/DATABASE-IR-CORE.md` (seção 9), pronta para quando a migração de provider acontecer.
- `apps/site` continua sobre `isFeatured`/IndexedDB — os novos limites (8/7) foram alinhados manualmente; quando o portal migrar para consumir `Article`/`EditorialPlacement` reais, essa lógica inteira é substituída, não reconciliada campo a campo.
- Nenhuma "central de posições" (tela mostrando todas as 8 vagas da capa, por exemplo) foi construída — não pedida explicitamente; `listActivePlacement` está pronto para alimentar uma, quando/se for pedida.
- `logo-nova-sem-fundo.png` (não oficial) continua presente, sem uso, em `apps/sistema/public/brand/` — mesma pendência de limpeza já registrada em fases anteriores, não resolvida agora.

### Próxima fase

A decidir pelo usuário — possíveis caminhos: retomar a validação de auth real (Fase 20/21, ainda pendente rodar `supabase login` de novo e promover o owner), ou avançar para uma tela de gestão de posições editoriais no painel (consumindo `listActivePlacement`), ou seguir para a migração de provider do conteúdo editorial propriamente dita.

---

## Fase 20 — hardening: owner imutável, auth SSR, convite server-side (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `85966b7` (commit da Fase 19).
- Entrega: corrige as 3 lacunas reais deixadas pela Fase 19 — trigger do owner endurecido (bloqueava só role/active/id, agora bloqueia qualquer UPDATE/DELETE), `AuthGate` client-side substituído por proteção real via middleware Next.js (`@supabase/ssr`, cookies), e convite de usuário movido inteiramente para o servidor (Admin API com `service_role`, nunca no navegador, nunca sequestrando a sessão de quem convida). **A nova migration não foi aplicada** — a sessão da CLI expirou de novo (terceira vez nesta arco de fases); código e migration prontos e revisados, aplicação real pendente.

### Migration `20260923100000_owner_immutable_hardening.sql` — pronta, não aplicada

`CREATE OR REPLACE FUNCTION public.protect_owner_profile()`: a versão da Fase 19 comparava campo a campo (`NEW.role is distinct from 'owner'`, `NEW.active is distinct from true`, `NEW.id is distinct from OLD.id`), deixando `name` e qualquer coluna futura fora da proteção. A nova versão é radical: `if OLD.role = 'owner' then raise exception ...` sem nenhuma comparação de campo — qualquer `UPDATE` numa linha que já é owner falha, ponto. A promoção inicial continua possível porque, nesse momento, `OLD.role` ainda é `operator`/`admin` — o bloqueio só existe depois que a linha já é owner. Nenhuma migration anterior tocada (só `CREATE OR REPLACE FUNCTION`, mesmo nome/trigger da Fase 19).

**Confirmado antes desta fase** (validação real feita na continuação da Fase 19): a migration `20260922100000_...` já estava aplicada — `profiles_role_check` com os 3 papéis, índice `profiles_single_owner`, trigger, 4 helpers de RLS, policies novas de `profiles`/`audit_events`, tudo confirmado por introspecção direta do banco (`supabase db query --linked`). Também confirmado: **existe 1 profile real** (`role='operator'`, `active=true`, criado pelo usuário — nunca lemos e-mail nem qualquer dado além de role/active/created_at).

### Auth SSR — a proteção real, não mais só o `AuthGate`

`apps/sistema/src/middleware.ts` (novo): usa `@supabase/ssr` (`createServerClient` com cookies do request/response) e `auth.getUser()` — não `getSession()`, porque `getUser()` revalida o token contra o servidor de Auth a cada requisição em vez de só confiar no que está no cookie. Matcher cobre `/sistema/:path*` e `/login`. Sem usuário → redirect para `/login`; `profiles.active = false` → redirect para `/login?erro=inativo`; usuário autenticado acessando `/login` → redirect para `/sistema`. **Testado de verdade nesta fase** (servidor local, sem sessão): `GET /sistema`, `/sistema/usuarios`, `/sistema/editorial/materias`, `/sistema/editorial/importar-pdf` → todos `307` para `/login`, confirmados via `curl -D -` (cabeçalho `location`), antes de qualquer HTML de página protegida ser gerado.

Três clientes Supabase, cada um com escopo próprio:
- `lib/supabase/browser.ts` — `createBrowserClient` (cookies, substitui o antigo `lib/supabaseClient.ts` da Fase 17/19, **removido**).
- `lib/supabase/server.ts` — `createServerClient` para Server Components/Actions (`next/headers` cookies).
- `lib/supabase/admin.ts` — só `service_role`, `import "server-only"` na primeira linha (o build do Next.js falha se um Client Component importar isso por engano); `hasServiceRoleKey()` permite checar disponibilidade sem lançar.

`AuthProvider`/`AuthGate` (Fase 19) foram atualizados para o novo cliente browser, mas passaram a ser explicitamente documentados como camada de UX (evitar flash de conteúdo), não mais a fronteira de segurança — essa é o middleware.

### Convite de usuário — server-side, `service_role` nunca no navegador

`client.auth.signInWithOtp()` (Fase 19) removido do `UsersManager.tsx`. Novo `app/sistema/usuarios/actions.ts` (`"use server"`, `inviteUser(email, role)`): revalida a sessão de quem chama (`getUser()` no servidor — nunca confia em nada que o cliente diga sobre si mesmo), carrega o `profiles` real dessa pessoa, e só então aplica as regras — `operator` não convida ninguém; `admin` só convida `operator`; só `owner` convida `admin`; papel `owner` nunca é uma opção aceita pela action. Sem `SUPABASE_SERVICE_ROLE_KEY` configurada (`hasServiceRoleKey()` checado antes de qualquer chamada à Admin API), retorna erro claro em vez de quebrar — confirmado: neste ambiente a variável não está definida, então convidar hoje mostra essa mensagem, esperado. Com a chave, usa `admin.auth.admin.inviteUserByEmail()` — diferente do `signInWithOtp` da Fase 19, essa chamada devolve o `id` do usuário criado, então promover a `admin` (quando convidado por um owner) funciona de verdade via uma segunda escrita com o cliente admin.

Novo `app/definir-senha/page.tsx` — destino do link de convite, rota pública (fora de `/sistema`, fora do matcher do middleware): a pessoa convidada define a própria senha (`auth.updateUser({password})`), depois entra normalmente por `signInWithPassword`. **Não testado de ponta a ponta nesta sessão** (sem como enviar/receber e-mail real neste ambiente) — precisa de um convite real, feito pelo usuário, para validar.

### `.env.example` — nome novo, sem valor

`SUPABASE_SERVICE_ROLE_KEY=` (sem valor) e `NEXT_PUBLIC_SISTEMA_URL=` (opcional, usada só para montar o link de retorno do convite) adicionadas a `apps/sistema/.env.example`. `apps/sistema/.env.local` (gitignorado) **não foi alterado** — a chave de service role não foi pedida, não foi fornecida, não existe neste ambiente.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 25 rotas (nova: `/definir-senha`); log confirma `ƒ Middleware 87.1 kB` compilado.
- Middleware testado localmente sem sessão: `/sistema`, `/sistema/usuarios`, `/sistema/editorial/materias`, `/sistema/editorial/importar-pdf` → `307` para `/login` em todos, antes de qualquer conteúdo protegido.
- Migration desta fase **não aplicada** — sessão da CLI expirou (`Unauthorized` até em `supabase projects list`); revisão estática do SQL é o único nível de validação possível nesta sessão.
- Convite server-side e fluxo de definir senha **não testados de ponta a ponta** — dependem de envio real de e-mail, inviável neste ambiente.
- `apps/site`: não tocado.
- Nenhum secret impresso em log; `SUPABASE_SERVICE_ROLE_KEY` nunca solicitada, nunca fornecida, nunca vista por esta sessão.

### Pendências e decisões

- **Bloqueador real**: `supabase login` precisa ser rodado de novo (terceira vez) antes da migration desta fase poder ser aplicada.
- Depois disso: promover o primeiro owner (SQL em `docs/DATABASE-IR-CORE.md`, seção 8 — usando o e-mail que o próprio usuário já cadastrou, nunca adivinhado por esta sessão), testar login real (owner e a conta operator já existente), testar o fluxo de convite de ponta a ponta.
- Criação de usuário via painel depende de `SUPABASE_SERVICE_ROLE_KEY` ser configurada em `apps/sistema/.env.local` pelo próprio usuário — fora do escopo desta sessão (a chave nunca é pedida no chat).
- Nenhuma tela de conteúdo editorial foi tocada nesta fase — só autenticação/gestão de usuários.

### Próxima fase

A decidir pelo usuário — mas só depois de: `supabase login` de novo, aplicar a migration desta fase, promover o primeiro owner, testar login/logout/convite reais pela aplicação. Depois disso: migração provider-por-provider do conteúdo editorial, começando por `apps/sistema`, e só então `apps/site`.

---

## Fase 19 — perfis reais (owner/admin/operator) + auth real do painel (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `07d5b17` (commit da Fase 18).
- Entrega: modelo de papéis substituído (admin/editorial → owner/admin/operator) via migration incremental + trigger de proteção do owner + RLS reescrita; `apps/sistema` trocou a sessão mock (Fase 16) por Supabase Auth real; nova tela `/sistema/usuarios`. **A migration ainda não foi aplicada ao banco remoto** — a sessão da CLI expirou no meio da fase (bloqueio novo, diferente do da Fase 18), então nada disso funciona de ponta a ponta até o usuário rodar `supabase login` de novo e aplicar.

### Migration `20260922100000_owner_admin_operator_roles.sql` — pronta, não aplicada

Sequência dentro do arquivo: `ALTER ... DROP CONSTRAINT` (a antiga não aceita `operator`) → `UPDATE profiles SET role='operator' WHERE role='editorial'` (migra dados existentes antes de reapertar a constraint) → `ALTER ... ADD CONSTRAINT` (novo enum) → índice único parcial `profiles_single_owner` (`WHERE role='owner'` — no máximo 1 linha possível) → função+trigger `protect_owner_profile` (`BEFORE UPDATE OR DELETE` em `profiles`, bloqueia qualquer alteração de `role`/`active`/`id` numa linha que já é owner, e qualquer `DELETE` dela) → `handle_new_auth_user()` redefinida (role inicial `operator`, nunca admin/owner) → `is_active_staff()`/`is_active_admin()` redefinidas + `is_active_owner()`/`is_active_admin_or_owner()` novas → policies de `profiles` (select/insert/update) e de `audit_events` (select) reescritas para 3 papéis. Nenhuma migration antiga (Fase 17) foi tocada — só `CREATE OR REPLACE`/`ALTER`/`DROP POLICY`+`CREATE POLICY` sobre o que já existia.

**Por que a proteção do owner tem duas camadas**: a RLS decide quem pode *tentar* uma alteração (ex.: admin só mexe em linhas `role='operator'`); o trigger garante que, mesmo que uma tentativa passe pela RLS por algum motivo (bug de policy, caminho que já autenticou como outro papel), a linha do owner continua intocável. Nenhuma das duas camadas depende da interface — reforça a regra do Plano Mestre de nunca confiar só na aplicação para invariantes de negócio importantes.

### Bloqueio novo: sessão da CLI expirou

`supabase projects list` e `supabase db push --dry-run` passaram a retornar `{"message":"Unauthorized"}` (401 real do Supabase, não o classificador de permissões do ambiente que bloqueou a Fase 18) — a sessão criada por `supabase login` no início da Fase 18 não está mais válida. **Ação necessária, fora deste ambiente**: rodar `supabase login` de novo no terminal do usuário; depois disso, a sequência já validada (`link` → `db push --dry-run` → `db push`) deve funcionar igual à Fase 18.

### Auth real do `apps/sistema` — sessão mock removida

`apps/sistema/src/lib/mockSession.ts` **deletado** (não usado em lugar nenhum — confirmado por grep antes de remover). Novo `apps/sistema/src/lib/auth/AuthProvider.tsx`: contexto React que usa `client.auth.getSession()`/`onAuthStateChange()` como única fonte de verdade (nunca `localStorage` como flag de autenticação — a persistência interna do SDK do Supabase é outra coisa, não o hack de flag booleana da Fase 16), carrega o `profiles` real correspondente ao usuário logado, e desconecta automaticamente (`signOut()` + status `"inactive"`) quando `active=false`. Montado uma única vez em `RootProviders.tsx` (novo), dentro do layout raiz — cobre `/login` e `/sistema/*` com a mesma instância/assinatura.

- `AuthGate.tsx`: reescrito para usar `useAuth().status` em vez de `hasMockSession()`; redireciona para `/login` (sem sessão) ou `/login?erro=inativo` (conta desativada).
- `login/page.tsx`: reescrito para `client.auth.signInWithPassword({email, password})` de verdade; precisou de um `<Suspense>` em volta do form (usa `useSearchParams()` para ler `?erro=inativo` — Next.js exige isso para não quebrar o build estático). Logo trocada de novo? Não — continua `logo-ir.png`, sem mudança visual nesta fase (item 6 da Fase 19, mantida).
- `AdminHeader.tsx`/`AdminShell.tsx`: botão "Sair" agora chama `useAuth().signOut()` (real) em vez de `clearMockSession()`; `AdminHeader` ganhou o nome do usuário logado (`profile.name`, escondido em telas estreitas) e o link "Usuários" (só quando `role` é `owner`/`admin`); `MobileNav.tsx` idem para o menu mobile.

### `/sistema/usuarios` — nova

`features/usuarios/UsersManager.tsx`: lista todos os perfis (`select` em `profiles`, sujeito à RLS — um `operator` que acessasse a URL diretamente só teria a mensagem "sem permissão", já que a query em si é decidida pelo banco, não escondida só na UI); ações de promover/rebaixar (só `owner`) e ativar/desativar (`owner` sobre admin/operator, `admin` só sobre operator) — tudo `UPDATE`s simples sobre `profiles`, cada um só tem efeito se a RLS permitir. Owner aparece com pílula "Proprietário" e sem nenhuma ação (nem no banco seria possível). Sem exclusão física de usuário (item 8 da Fase 19) — só ativar/desativar, em toda a tela.

Botão "Convidar" usa `client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` — a única forma de criar uma conta nova sem `service_role` e sem trocar a sessão do navegador de quem está convidando (diferente de `signUp()`, que logaria como o novo usuário). **Limitação documentada, não testada nesta sessão** (sem como testar envio de e-mail aqui): a resposta dessa chamada nunca traz o `id` do usuário criado, então convidar "como admin" não promove automaticamente — a conta sempre nasce `operator` via trigger, e promover a admin é sempre um passo manual depois que a pessoa aparecer na lista.

### Ação manual necessária — primeiro owner

Documentada em detalhe em `docs/DATABASE-IR-CORE.md` (seção 7): (1) criar a conta real no Dashboard do Supabase (Authentication → Users — `enable_signup=false` bloqueia autocadastro público, então essa primeira conta só nasce por ali); (2) depois da migration aplicada, promover via SQL Editor do Dashboard com um `UPDATE ... WHERE id = (select id from auth.users where email = '...')` — nunca commitado, nunca com e-mail fixo em migration. O índice único garante que só funciona uma vez.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 24 rotas (nova: `/sistema/usuarios`; `/login` cresceu de ~1kB para ~1.8kB pelo `Suspense`+lógica real de auth).
- Migration **não aplicada** — bloqueio de sessão da CLI documentado acima; revisão estática do SQL (ordem de `ALTER`/`CREATE`, nomes de constraint/policy conferidos contra os nomes reais já aplicados na Fase 18) é o único nível de validação possível nesta sessão.
- Login real **não testado de ponta a ponta** — depende da migration aplicada e de pelo menos um usuário real existir, nenhum dos dois disponível nesta sessão.
- `apps/site`: não tocado.
- Nenhum secret impresso em log; nenhuma credencial administrativa usada ou salva.

### Pendências e decisões

- **Bloqueador real**: `supabase login` precisa ser rodado de novo pelo usuário antes de qualquer coisa desta fase poder ser aplicada/testada contra o banco real.
- Depois disso: aplicar a migration, criar o primeiro owner (2 passos manuais acima), testar login/logout/RLS pela aplicação com um usuário real.
- Convite "como admin" tem promoção manual como passo extra, documentado — não é um bug, é a limitação real da API de convite sem `service_role`.
- Nenhuma tela de conteúdo editorial (matérias/mídias/PDF/editorias/localidades) foi migrada para o banco nesta fase — só a autenticação. Continuam 100% sobre `@ir/mocks`.
- `npm audit`: sem novas dependências além do que já existia desde a Fase 17 (`@supabase/supabase-js` já instalado).

### Próxima fase

A decidir pelo usuário — mas só depois de: `supabase login` de novo, aplicar esta migration, criar o primeiro owner, testar auth real pela aplicação. Depois disso: migração provider-por-provider do conteúdo editorial, começando por `apps/sistema`, e só então `apps/site`.

---

## Fase 18 — validar banco real + corrigir logo do login (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d46934e` (commit da Fase 17).
- Entrega: correção visual pontual do login (logo errada) + as 12 migrations da Fase 17 **aplicadas de verdade** contra o projeto remoto `site-system-ir` (`iqnzrpdccecgalqboeyf`), com schema/RLS/triggers/constraints/seeds confirmados por introspecção direta do catálogo do Postgres. Fase rodada em duas partes: a primeira tentativa parou por falta de sessão local da CLI (registrado abaixo, corrigido pelo usuário fora deste ambiente); a segunda, já autenticada, concluiu link → dry-run → push → validação.

### Logo do login corrigida

`apps/sistema/src/app/login/page.tsx` usava `logo-escrita.png` (a marca com o nome escrito por extenso); trocada para `logo-ir.png` (o símbolo oficial). O elemento já era um `<img>` direto, sem wrapper/placa/padding/fundo — não havia "moldura" para remover, só o arquivo errado. Ajustado tamanho (34px → 48px de altura) e centralização (`margin: 0 auto`) em `.login-logo` (`globals.css`), já que o símbolo é mais compacto que a marca escrita e ficava desproporcional/desalinhado no mesmo tamanho.

### Autenticação da CLI — bloqueio real, depois resolvido pelo usuário

Primeira tentativa: `supabase login` (sem `--no-browser`) falhou com `LegacyLoginMissingTokenError` — "Cannot use automatic login flow inside non-TTY environments" (este ambiente de execução não tem terminal interativo para o fluxo de navegador). Conforme instrução ("não inventar credenciais, não pedir para colar token, parar antes do `db push`"), a execução parou exatamente aí e o diagnóstico exato foi reportado. O usuário rodou `supabase login` no próprio terminal (fora deste ambiente) e confirmou sucesso — a sessão ficou salva localmente (`~/.supabase`), nunca vista ou manuseada por esta sessão.

### Link → dry-run → push — os três confirmados, nesta ordem

1. `supabase link --project-ref iqnzrpdccecgalqboeyf` → `{"project_ref":"iqnzrpdccecgalqboeyf"}`.
2. `supabase projects list` (checagem extra de identidade) → confirmou `name: "site-system-ir"`, `linked: true`; os outros dois projetos da organização (`altnix-platform`, `FarmaTemp`) apareceram com `linked: false` — sem ambiguidade sobre o alvo.
3. `supabase db push --dry-run` → listou as 12 migrations, todas pendentes (`upToDate: false`), na ordem correta; revisão do conteúdo confirmou zero operação destrutiva (só `CREATE TABLE/INDEX/POLICY/TRIGGER/FUNCTION` e `INSERT ... ON CONFLICT DO NOTHING`).
4. `supabase db push` → as 12 migrations aplicadas com sucesso, sem erro. Nenhum `db reset` remoto, `drop` geral ou comando destrutivo usado.

### Validação do schema real (introspecção somente-leitura via `supabase db query --linked`)

- 11 tabelas em `public`, exatamente a lista esperada.
- RLS habilitada (`relrowsecurity = true`) nas 11.
- 31 policies — sem `delete` em nenhuma tabela de negócio exceto `article_media` (proposital, remover uma foto de uma matéria não é destrutivo); `pdf_import_candidates` com uma única policy de `update` que exclui `status = 'converted'` (`pdf_import_candidates_update_staff_not_converted`) — a proteção contra reconversão de candidato agora confirmada também no banco, não só na aplicação (Fase 15) e não só no texto da migration (Fase 17).
- 9 triggers — 8 `set_updated_at` + `on_auth_user_created` (`AFTER INSERT` em `auth.users`), criando `profiles` automaticamente.
- Índice único parcial `article_media_one_cover_per_article` (`WHERE role = 'cover'`) confirmado — 1 capa por matéria garantida no banco.
- 34 FKs/CHECKs conferidas uma a uma contra o desenho original.
- Seeds: `editorial_sections` = 7, `localities` = 4.

Detalhe completo em `docs/DATABASE-IR-CORE.md` (seção 5, reescrita nesta fase).

### Limite desta fase — teste funcional/RLS com usuário real não executado

O item "teste mínimo controlado" (criar usuário de teste, confirmar `profiles`, criar matéria draft, vincular editoria/localidade, placement, capa+galeria, audit event, validar RLS como sessão autenticada real) **não foi executado**: o classificador de modo automático deste ambiente bloqueou a tentativa de inserir uma linha em `auth.users` ("Modify Shared Resources") — uma escrita direta num sistema de autenticação real e compartilhado, mesmo sem senha, mesmo descartável, mesmo com plano de limpeza. Nenhuma linha chegou a ser criada (confirmado: `select count(*) from auth.users where id = '<uuid de teste>'` → `0`) — sem lixo de teste no banco. A validação estrutural (constraints/policies/triggers/índices acima) prova que as regras **existem** corretamente; não prova, por execução real, que elas se **comportam** como esperado sob uma sessão autenticada de verdade.

### Validação (build/typecheck/servidor)

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 23 rotas (inalterado).
- Servidor de desenvolvimento local (porta 3001): `/login` confirmado servindo `logo-ir.png` (`logo-escrita.png` ausente da resposta).
- Nenhum secret impresso em log em nenhum momento — nem o token de sessão da CLI, nem qualquer credencial administrativa; todas as consultas de validação foram somente-leitura contra o catálogo do Postgres.
- `apps/site`: não tocado.

### Pendências e decisões

- **Teste funcional/RLS end-to-end com usuário real** — bloqueado pelo classificador de permissões deste ambiente; próximo passo natural é o usuário rodar esse teste localmente (app real ou SQL editor do dashboard) ou liberar explicitamente esse tipo de escrita nesta sessão.
- `supabase/.temp/` (cache da CLI, criado pelo `link`) — já coberto por `.gitignore` desde o commit anterior desta mesma fase.
- Nenhuma tela migrada para o banco ainda — instrução explícita desta fase; painel continua 100% sobre `@ir/mocks`.
- `apps/sistema/.env.local` não foi alterado com nenhuma credencial administrativa (só a publishable key, já configurada desde a Fase 17).

### Próxima fase

A decidir pelo usuário — caminho sugerido: rodar o teste funcional/RLS com um usuário real (fora deste ambiente ou com permissão explícita), depois migração provider-por-provider começando por `apps/sistema` (matérias/editorias/localidades/mídias/importação de PDF), reconciliando as divergências de contrato já documentadas (`DATABASE-IR-CORE.md` seção 4), seguida de auth real substituindo a sessão mock da Fase 16, e só depois `apps/site`.

---

## Fase 17 — fundação real do banco JornalIR (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `9acc75c` (commit da Fase 16, checkpoint feito no início desta mesma fase).
- Entrega: schema real do IR Core (projeto Supabase `site-system-ir`) como migrations SQL versionadas, RLS completa, seeds mínimos, variáveis de ambiente configuradas por app, e documentação do mapa de tabelas. **Nenhuma tela migrou para o banco** — `apps/sistema` e `apps/site` continuam 100% sobre os providers mock; esta fase é só a fundação (schema + RLS + contratos alinhados + conexão preparada), a migração de fato fica para uma fase futura, provider por provider.

### Decisão de escopo — sem execução contra banco real ou local nesta sessão

O ambiente não tinha credenciais Supabase (CLI instalada, não autenticada). Perguntado ao usuário como proceder (preparar só localmente vs. validar com Supabase local via Docker vs. receber um token agora); resposta: **só preparar migrations localmente**. Consequência: as 12 migrations em `supabase/migrations/` foram escritas e revisadas estaticamente (ordem de FK conferida manualmente arquivo a arquivo), mas **nunca executadas** — nem `supabase db reset` (local) nem `supabase db push` (remoto). Documentado com destaque em `docs/DATABASE-IR-CORE.md` (seção 5) para não ser confundido com "validado".

### `supabase/` — migrations, config, sem segredo nenhum

`supabase/config.toml` (`project_id = "site-system-ir"`, `enable_signup = false` — cadastro só via Admin API, coerente com o painel de acesso restrito da Fase 16) + 12 migrations sequenciais em `supabase/migrations/`:

1. `extensions_and_helpers` — `pgcrypto`, trigger `set_updated_at()`.
2. `profiles` — perfil complementar a `auth.users` (`role` admin/editorial, `active`); trigger `handle_new_auth_user()` cria o profile automaticamente (role inicial sempre `editorial`); funções `is_active_staff()`/`is_active_admin()` (`SECURITY DEFINER`, evitam RLS recursivo) reaproveitadas por toda tabela seguinte.
3. `editorial_sections` — mesmos 7 campos/conceito da Fase 12 (`EditorialSection`).
4. `localities` — `scope` general/region/city, `parent_id` opcional (cidade→região, não usado pelos seeds).
5. `newspaper_editions` — `pdf_url`/`cover_url` opcionais, preparando (sem inventar) o futuro "Ver esta matéria na edição digital".
6. `articles` — `internal_reference` gerado automaticamente (`generate_article_reference()`, sequência dedicada, formato `IR-MAT-{ano}-{sequencial}`, mesma convenção conceitual do Plano Mestre Parte 11); sem policy de `delete` (arquivar é o único caminho).
7. `article_placements` — tabela própria (não coluna em `articles`); nunca substitui a editoria.
8. `media_assets` — `storage_path` preparado para Supabase Storage (nulo por ora), `public_url` é o caminho atual (mesmo comportamento do mock desde a Fase 06); `internal_reference` automático (`IR-MID-...`).
9. `article_media` — **índice único parcial `where role = 'cover'`** garante 1 capa por matéria no próprio banco, não só por convenção da aplicação; única tabela de negócio com policy de `delete` (remover uma foto de uma matéria não é destrutivo — a mídia continua existindo).
10. `pdf_import_batches` + `pdf_import_candidates` — persistem o fluxo já validado desde a Fase 08/15; `status` com 6 estados (`pending, kept, discarded, converted, merged, split` — mais expressivo que o mock atual, ver divergências abaixo); **RLS reforça no banco** que um candidato `converted` nunca é atualizado de novo (`status <> 'converted'` na condição da policy de `update`), mesma regra já aplicada em `ImportCandidateService.convertToDraft` desde a Fase 15, agora em duas camadas.
11. `audit_events` — sem `update`/`delete` para ninguém, nem admin (Parte P do Plano Mestre); só admin lê, staff ativo insere só em seu próprio nome.
12. `seed_reference_data` — 7 editorias (idênticas à Fase 12) + 4 localidades reais (Geral, Torres, Passo de Torres, São João do Sul — os mesmos nomes já usados em todo o mock do projeto, não fictícios); `on conflict do nothing`, idempotente.

### RLS — sem "liberar tudo para authenticated"

Dois papéis (`admin`, `editorial`) com o **mesmo acesso ao conteúdo editorial** nesta fase (a distinção prática é só: `admin` gerencia outros `profiles`, `admin` lê `audit_events`). Padrão em toda tabela de negócio: `select`/`insert`/`update` condicionados a `is_active_staff()`; sem `delete` (exceto `article_media`, justificado acima). Leitura pública (`anon`) deliberadamente **não** preparada nesta fase — nenhuma policy libera acesso anônimo; quando `apps/site` migrar, a policy deverá restringir a `status = 'published'`.

### Variáveis de ambiente — projeto real configurado, sem segredo no repositório

`apps/sistema/.env.local` (gitignorado, confirmado via `git check-ignore`) com `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reais do projeto `site-system-ir` (só a publishable key — seguro no cliente). `apps/sistema/.env.example` e `apps/site/.env.example` (nomes das variáveis, sem valores) criados; `.env.example` na raiz atualizado para os novos nomes. `apps/sistema/src/lib/supabaseClient.ts` (novo) — `createSupabaseClient()` lança erro claro se as variáveis não estiverem definidas, em vez de criar um cliente inválido; **não é chamado em nenhuma tela ainda**. `@supabase/supabase-js` adicionado como dependência de `apps/sistema`. Nenhum `SUPABASE_SERVICE_ROLE_KEY` nem token pessoal (`sbp_...`) em lugar nenhum do repositório.

### `packages/types`/`packages/core` — alinhados, não migrados

Nenhuma mudança de código nesses pacotes nesta fase (instrução explícita: não migrar telas, não remover mocks). Divergências entre o schema real e os contratos mock atuais documentadas em `docs/DATABASE-IR-CORE.md` (seção 4): `ImportCandidateStatus` do mock (3 estados) é mais estreito que o do banco (6 estados); `MediaAsset.name` (mock) vira `title` (banco); `ArticleOrigin` usa `pdfImport` (mock) vs. `pdf` (banco); IDs são `string` sequencial no mock vs. `uuid` no banco. Nenhuma reconciliação de código feita agora — fica para a fase de migração real.

### `docs/DATABASE-IR-CORE.md` (novo)

Mapa de tabelas e relacionamentos, tabela-por-tabela com papel e observações, papéis/RLS, divergências conhecidas, como aplicar (local com Docker vs. remoto com `supabase link`/`db push`), variáveis de ambiente, sugestão de próxima fase.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros (inclui `supabaseClient.ts`, novo). `npm run typecheck --workspace @ir/site`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso (rotas inalteradas — nenhuma tela nova, só o cliente Supabase preparado sem uso).
- **Migrations não executadas nesta sessão** (decisão de escopo acima) — revisão manual arquivo a arquivo confirmou ordem de FK correta (profiles → editorial_sections/localities/newspaper_editions → articles → article_placements/media_assets → article_media → pdf_import_batches/candidates → audit_events → seeds) e ausência de referência a tabela ainda não criada. Sem prova de execução real (`db reset`/`db push`) — registrado como pendência explícita.
- `apps/site`: nenhuma tela alterada; só `apps/site/.env.example` (novo, sem valores) e `apps/site/tsconfig.tsbuildinfo` (artefato de typecheck).
- Nenhum secret exposto em log, commit ou código — só a publishable key (documentadamente segura no cliente) em `.env.local` (gitignorado) e `.env.example`/docs (sem valor real).

### Pendências e decisões

- **Migrations nunca aplicadas** (nem local, nem remoto) — validar com `supabase start && supabase db reset` (local) ou `supabase link --project-ref iqnzrpdccecgalqboeyf && supabase db push` (remoto) antes de considerar o schema definitivamente correto; usar credenciais próprias, nunca commitadas.
- RLS pública (para `apps/site` ler `published`) deliberadamente não preparada — próxima fase de integração do portal.
- Divergências de contrato (seção 4 do `DATABASE-IR-CORE.md`) não reconciliadas em código — só documentadas.
- `SUPABASE_SERVICE_ROLE_KEY`/token pessoal (`sbp_...`) nunca solicitados nem usados nesta fase — qualquer migration remota futura exigirá o usuário rodar `supabase login`/`db push` com as próprias credenciais, fora deste ambiente ou como variável de ambiente local nunca persistida em arquivo versionado.
- `npm audit` reportou novas vulnerabilidades transitivas ao instalar `@supabase/supabase-js` (mesma categoria já documentada desde a Fase 07 para o Tiptap); nenhuma ação nesta fase.

### Próxima fase

A decidir — caminho sugerido em `docs/DATABASE-IR-CORE.md` (seção 7): validar as migrations de fato (local ou remoto), depois migração provider-por-provider começando por `apps/sistema` (matérias/editorias/localidades/mídias/importação de PDF), reconciliando as divergências de contrato, seguida de auth real substituindo a sessão mock da Fase 16, e só depois `apps/site` lendo `published` diretamente do banco.

---

## Fase 15 — fluxo editorial completo do painel (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `a4311be` (commit do portal público, apps/site — apps/sistema seguia em `3319d70`, Fase 12).
- Entrega: fecha o caminho `Selecionar edição → carregar PDF → extrair → revisar candidatos → transformar em matéria → editar → publicar/agendar` sem vínculos soltos. Boa parte do domínio (`Article` já com `placement`, `notificationMode`, `editionId`/`editionPageNumber`, `origin`, `reference`, `media[]`; `ImportCandidate` já com `createdArticleId`) já existia desde as Fases 06–09 — esta fase é majoritariamente de **interface e uma lacuna real de defesa em profundidade no serviço**, não de novo modelo de dados. Ainda sem Supabase, auth real, integração Altnix, publicidade/playlist, financeiro, CRM ou redesign do painel inteiro.

### Achado real corrigido — conversão duplicada não era bloqueada pelo serviço

`ImportCandidateService.convertToDraft` (packages/core) nunca checava `candidate.status` antes de converter — a proteção contra "converter duas vezes o mesmo candidato" existia **só na interface** (`ImportCandidateList`/`ImportCandidateReview` escondem o botão quando não `pending`), o que é fácil de contornar (chamar a Server Action de novo, uma aba antiga, um clique duplo antes do revalidate). Corrigido: novo `ImportCandidateAlreadyProcessedError` e uma checagem no início de `convertToDraft` que rejeita qualquer conversão de candidato que não esteja `pending`, citando a matéria já criada quando aplicável. Validado no script de negócio (abaixo): reconverter o mesmo candidato é rejeitado e nunca cria uma segunda matéria.

### `DestinoEditorial.tsx` (novo) — "para onde essa matéria vai", sempre derivado

Componente de apresentação puro (`apps/sistema/src/features/editorial/DestinoEditorial.tsx`): recebe editoria, localidade, destaque/placement (com janela de início/fim quando houver), notificação, uma frase de publicação já resolvida pelo chamador, e opcionalmente edição/página + URL da edição digital. Nunca decide uma regra nova — só lê o que a própria matéria (ou o candidato em revisão) já tem configurado. Usado em dois lugares: `ArticleForm.tsx` (aside, computado a partir do estado atual do formulário — atualiza ao vivo enquanto o usuário edita, antes mesmo de salvar) e `ImportCandidateReview.tsx` (abaixo da Classificação, com uma frase própria explicando que destaque/publicação só são decididos depois, na edição da matéria criada — a conversão sempre nasce `draft` sem destaque).

### Vínculo com a edição — visível e corrigível, nunca inventado

- `ArticleForm.tsx`: nova seção "Origem" no aside (só aparece editando uma matéria existente) — pílula de origem (`articleOriginLabels`: Manual/Importado do PDF) e, quando há `editionId`, `editionPageLabel(edition.title, article.editionPageNumber)` (ex.: "Edição 037 — 08 a 14 de setembro · Página 6") mais um campo numérico para corrigir a página depois de importada. "Ver esta matéria na edição digital" só vira link real quando `NewspaperEdition.pdfUrl` existe (campo já presente no tipo desde a Fase 08, hoje sempre vazio nos mocks) — sem `pdfUrl`, mostra texto explicando que o link ainda não está disponível. **Nunca inventamos a URL.**
- `ImportCandidateReview.tsx`: mesma lógica via `DestinoEditorial`, usando a edição já carregada pela página (`edition.pdfUrl`).
- `materias/actions.ts`: `updateArticle` só inclui `editionPageNumber` no patch quando o formulário de fato enviou um valor válido — nunca sobrescreve com `undefined` a página de uma matéria manual sem edição (spread de um objeto com a chave ausente, não com valor `undefined`).

### Listagem de matérias — origem, edição/página e filtros novos

`MateriasList.tsx`: nova coluna "Origem" (pílula + edição/página abaixo, quando houver) na tabela desktop e na meta-linha dos cartões mobile; três novos filtros (Origem, Fotos — com/sem, Destaque — com/sem), somando aos já existentes (status, editoria, localidade, busca). Tudo client-side sobre o array já carregado (mesmo padrão desde a Fase 05) — sem novo filtro no repositório, que já tinha `ArticleFilters.placementType`/`editionId` não usados por esta tela. `materias/page.tsx` passou a buscar também `newspaperEditionService.list()`.

### Não duplicar matéria — reforçado na revisão do candidato, não só na lista

`ImportCandidateList.tsx` já mostrava "Ver rascunho" para candidato convertido desde a Fase 08 (não mudou). `ImportCandidateReview.tsx` (a tela de detalhe) não tinha o mesmo link — corrigido: candidato `converted` com `createdArticleId` agora mostra "Abrir a matéria →" na própria seção "Origem", ao lado do aviso de que a edição está bloqueada.

### Correção de página — só onde já existe edição

`ArticleFormPayload` ganhou `editionPageNumber: string` (valor do campo, paralelo ao padrão já usado por `ImportCandidateReview` para `pageNumber`). Em `ArticleForm`, o campo só é renderizado quando `article.editionId` existe — matéria manual nunca ganha esse campo na tela, então o payload chega vazio e a Server Action não aplica a chave (ver acima).

### CSS

Bloco novo em `globals.css`: `.origin-pill`/`.origin-pill--manual`/`.origin-pill--pdfImport` (pílula discreta, mesmo padrão visual de `.status-pill`/`.notification-pill`) e `.destino-box`/`.destino-title`/`.destino-list`/`.destino-label`/`.destino-window`/`.destino-muted` (lista rotulada com `flex-wrap`, sem largura fixa — não quebra em telas estreitas). Filtros novos de `MateriasList` reaproveitam `.materias-filters` (já com `flex-wrap: wrap`, sem CSS novo necessário).

### Mobile

Nenhum componente novo tem layout dedicado de mobile-redesign (fora do escopo desta fase) — reaproveita integralmente os padrões já responsivos das Fases 05/06 (`.materia-card`/`.materia-card-meta` com `flex-wrap`, `.form-section`/`.article-form-layout` já empilhando abaixo do breakpoint definido nas fases anteriores). Confirmado por leitura de CSS que nenhuma adição desta fase introduz largura fixa ou `white-space: nowrap` capaz de causar overflow horizontal; sem ferramenta de automação de navegador nesta sessão para verificação visual em viewport real (mesma limitação documentada desde a Fase 06) — recomenda-se um teste manual rápido no celular antes de considerar a fase definitivamente encerrada para uso real.

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros. `npm run typecheck --workspace @ir/site`: sem erros (tipos compartilhados não quebraram o portal — nenhum tipo de `@ir/types` foi alterado nesta fase).
- `npm run build --workspace @ir/sistema`: sucesso, 22 rotas (sem rota nova — esta fase evoluiu telas existentes, não criou novas).
- Validação de negócio (script `tsx` temporário, `apps/sistema/tmp-fase15-validation.mts`, removido ao final, nunca commitado) — fluxo completo com um **PDF real do acervo** (`apps/site/public/uploads/jornal-online/IR 685_compressed.pdf`, o mesmo já usado pela Fase 10), reproduzindo os serviços da composição real: **27/27 asserções** — extração real gera candidatos pendentes vinculados à edição; revisão (`keep`) salva editoria/localidade escolhidas; conversão sempre nasce `draft`, `origin: "pdfImport"`, preserva `editionId`/`editionPageNumber`; capa + item de galeria com legenda/crédito individuais preservados na conversão; **reconverter o mesmo candidato é rejeitado** (`ImportCandidateAlreadyProcessedError`) e não cria uma segunda matéria; candidato muda para `converted` com `createdArticleId` correto; edição pós-conversão adiciona uma terceira foto à galeria, aplica destaque (`sectionHighlight`), corrige a página da edição; agendar muda o status e persiste `scheduledAt`; publicar agora muda o status e preenche `publishedAt`; matéria final aparece em `articleService.list()` com origem, vínculo de edição e as 3 fotos intactos.
  - **Achado durante a escrita do script** (documentado para não ser redescoberto — é o mesmo artefato já registrado na Fase 09, achado 4): misturar dois caminhos relativos diferentes até `composition/editorial.ts` num script solto reinstancia o módulo (repositório mock em memória duplicado) e faz uma matéria criada por uma instância "sumir" para a outra. Corrigido no próprio script, importando `articleService`/`importCandidateService` sempre pelo mesmo caminho (`pdfCandidateExtraction`, que os reexporta exatamente para isso); serviços somente-leitura (editorias/localidades/mídias/edições) não têm esse risco por não serem mutados no script.
- Não alterado: `apps/site` (verificado — só `apps/sistema`, `packages/core`, `packages/mocks` tocados nesta fase; `packages/types` e `packages/mocks` sem mudança de schema, só leitura), pipeline de extração de PDF (`@ir/pdf-extraction`, nenhum arquivo tocado), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- `NewspaperEdition.pdfUrl` continua vazio em todos os mocks — "Ver esta matéria na edição digital" está preparado (tipo, componente, condicional) mas nunca aparece como link ativo nesta fase, por design ("não inventar URL"). Preencher quando houver uma fonte real de verdade ligando `NewspaperEdition` (sistema) a uma edição publicada no portal (`apps/site` jornal-online, que hoje usa um acervo de arquivos sem esse vínculo).
- Correção de página da edição (`editionPageNumber`) só é exposta na edição de uma matéria já vinculada a uma edição — criar esse vínculo do zero fora do fluxo de importação de PDF não foi pedido e permanece fora de escopo.
- Guard de reconversão foi adicionado só em `convertToDraft` (o ponto que realmente cria uma matéria) — `keep`/`discard`/`merge`/`split` não ganharam guard simétrico por não terem sido citados no requisito e não apresentarem o mesmo risco de duplicação de matéria.
- Sem teste de automação de navegador real (mobile ou desktop) nesta sessão — mesma limitação documentada desde a Fase 06; validação de mobile nesta fase foi por leitura de CSS/reuso de padrões já responsivos, não por viewport real.
- `npm audit` continua reportando vulnerabilidades transitivas (Tiptap desde a Fase 07); nenhuma ação nesta fase.

### Próxima fase

A decidir — possíveis caminhos: upload real de mídia (quando houver storage), cadastro central (pessoas/empresas), publicidade do portal, redesign definitivo do painel (mobile-first), ou vínculo real entre `NewspaperEdition` e a edição digital do portal (para ativar "Ver esta matéria na edição digital"). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 12 — editorias, localidades e biblioteca de mídia (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `598b965` (commit da Fase 11).
- Entrega: três telas de gestão que fecham o ciclo de apoio ao editorial — `/sistema/editorial/editorias`, `/localidades` e `/midias` — mais o requisito permanente de legenda/crédito individuais por foto em qualquer matéria com galeria. Ainda sem Supabase, storage real, upload remoto ou OCR.

### `packages/types` — extensões de domínio

- `EditorialSection` ganhou `order: number` (ordem de exibição definida pela redação, não o índice do array).
- `MediaAsset` ganhou `name: string` (obrigatório — nome curto para localizar na biblioteca, diferente da legenda de publicação), `caption?`, `credit?` (legenda/crédito padrão da mídia) e `capturedAt?` (data da foto, distinta de `createdAt` = data de cadastro).
- `ArticleMedia` ganhou `caption?`/`credit?`: sobrescrevem, só para aquele uso específico, a legenda/crédito padrão da mídia — ausentes, a exibição cai para o padrão. Nenhuma mudança em `Locality` (já tinha `active`; "organizar cidade/região/geral" é agrupamento na interface, não um campo novo).

### `packages/core` — de somente-leitura para CRUD completo

- `EditorialSectionRepository`/`Service`: `create`/`update` no repositório; no serviço, `create` (gera `slug` a partir do nome quando ausente, `order` = próximo disponível), `update` (nome/slug/descrição), `setActive`, `reorder(orderedIds)` (reatribui `order` sequencialmente na ordem recebida), `listActive()`. Novo `DuplicateSlugError`; reaproveita `EditorialSectionNotFoundError` já existente em `article-service.ts` (sem duplicar a classe).
- `LocalityRepository`/`Service`: mesmo padrão — `create`/`update`/`setActive`/`listActive()`, `DuplicateLocalitySlugError`, reaproveita `LocalityNotFoundError` existente.
- `MediaAssetRepository`/`Service`: deixou de ser somente-leitura. `register(input)` cataloga uma mídia a partir de uma **URL já hospedada** (sem storage real, nunca recebe um arquivo) gerando `reference` automática; `update(id, changes)` edita nome/URL/legenda/crédito/texto alternativo/data. Vínculo com matéria **não é um campo armazenado aqui** — é calculado por quem lê `ArticleService.list()` e cruza `mediaAssetId`, para não duplicar a fonte de verdade (decisão deliberada, documentada no próprio serviço).
- `ArticleService` **não foi alterado**: `media: ArticleMedia[]` já aceitava `caption`/`credit` por ser um tipo genérico (`Partial<Omit<Article,...>>`), então legenda/crédito individuais passam a funcionar automaticamente por já existir o campo no tipo.

### `packages/mocks` — providers em memória com mutação real

- `createEditorialSectionRepositoryMock`, `createLocalityRepositoryMock`, `createMediaAssetRepositoryMock`: o mesmo padrão já usado por `createArticleRepositoryMock` desde a Fase 06 (cópia do array inicial em uma variável de módulo, `create`/`update` mutam essa cópia — estado dura a sessão do processo, nunca persistência real).
- `data.ts`: `editorialSections` ganhou `order` (0 a 6) e duas novas editorias dos exemplos do Plano Mestre que ainda faltavam — **Eventos** e **Cidades** (total agora 7: Geral, Esporte, Polícia, Política, Economia, Eventos, Cidades). `mediaAssets`: todas as 9 entradas ganharam `name` (agora obrigatório no tipo); 5 ganharam `caption`/`credit`/`capturedAt` de exemplo para a biblioteca não nascer com tudo vazio.

### Interface — três telas novas, mesma linguagem visual do shell

- **`/sistema/editorial/editorias`** (`EditoriasManager.tsx`): tabela com Ordem (botões ↑/↓ que chamam `reorderSections` com a lista reordenada inteira), Nome, Identificador, Descrição, Status (pílula + Ativar/Inativar) e Ações. Criar abre um formulário compacto no topo (`<div>` recolhível via estado, não `<details>` — precisa fechar sozinho após salvar); editar transforma a própria linha em campos editáveis, sem navegar para outra página (poucos cliques, conforme pedido). Nenhuma editoria hardcoded — tudo vem de `editorialSectionService.list()`.
- **`/sistema/editorial/localidades`** (`LocalidadesManager.tsx`): mesmo padrão de criação/edição inline; tabela ordenada por abrangência (Cidade → Região → Geral) e depois por nome — "organizar cidade/região/geral" é esse agrupamento visual, não uma hierarquia de dados nova. Sem reordenação manual (não pedida para localidades, diferente de editorias).
- **`/sistema/editorial/midias`** (`MidiasLibrary.tsx`): grade de miniaturas (reaproveita `.library-item` do seletor de mídia da Fase 06) + painel de detalhe/edição lateral que abre ao clicar em uma mídia ("selecionar" = ver/editar metadados, já que esta é a tela de catálogo, não um seletor embutido em outro formulário). Barra de pesquisa (nome/referência/legenda/crédito) e filtro por vínculo (vinculada a matéria / sem vínculo). Painel de detalhe mostra "Usada em" com links diretos para as matérias que usam aquela mídia — calculado em `midias/page.tsx` cruzando `articleService.list()` com `mediaAssetId`, nunca lido de um campo armazenado.
- **Legenda/crédito individuais** (`ArticleMediaPicker.tsx`, `articleMediaState.ts`): a capa e cada item da galeria ganharam dois campos de texto discretos (placeholder mostrando a legenda/crédito padrão da mídia quando existir); `setMediaCaption`/`setMediaCredit` (novas funções puras) sobrescrevem só o uso daquele item naquela matéria — nunca a mídia em si. Usado tanto em `ArticleForm.tsx` (Fase 06) quanto em `ImportCandidateReview.tsx` (Fase 08), os dois consumidores existentes do seletor de mídia.
- **Editoria/localidade inativa some das opções de matéria nova, mas nunca de uma já atribuída**: `ArticleForm.tsx` e `ImportCandidateReview.tsx` agora filtram as opções dos `<select>` para `active || já-selecionada-nesta-matéria` — sem essa regra, "inativar" seria um botão sem efeito prático em nenhum outro lugar do sistema.
- `EditorialOverview.tsx`: três novos links ("Editorias", "Localidades", "Biblioteca de mídia") ao lado dos já existentes.

### CSS

Bloco novo em `globals.css` (`.inline-form`, `.reorder-buttons`, `button.header-action` como reset para uso em `<button>` além de `<a>`, `.media-caption-input`/`.media-slot-fields` para legenda/crédito por item, `.media-library-layout`/`.media-library-item`/`.media-detail-panel`/`.media-usage-list` para a biblioteca) — mesma linguagem visual (papel claro/verde escuro, sem Tailwind além do já configurado, sem `@ir/ui`), responsivo (`.media-library-layout` empilha abaixo de 900px).

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros. `npm run typecheck --workspace @ir/site`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 22 rotas (3 novas: `/editorial/editorias`, `/editorial/localidades`, `/editorial/midias`, todas estáticas).
- Validação de negócio (script `tsx` temporário, removido ao final, nunca commitado), reproduzindo os mesmos serviços da composição real — **19/19 asserções**: 7 editorias iniciais na ordem correta; criar editoria gera slug e ordem automáticos; slug duplicado rejeitado (editoria e localidade); editar atualiza só os campos enviados; inativar remove de `listActive()` sem apagar; reordenar reatribui `order` sequencialmente; 4 localidades iniciais; criar/editar localidade; 9 mídias iniciais todas com nome; registrar mídia gera referência automática (`IR-MID-2026-…`); editar mídia inexistente rejeitado; **matéria real salva com capa + galeria de 2 fotos, ordem preservada, legenda/crédito individuais por item mantidos**; reordenar a galeria de uma matéria já salva persiste a nova ordem; vínculo mídia→matéria calculável a partir de `ArticleService.list()` sem campo duplicado.
- Servidor de produção local (porta 3001, verificada livre antes e encerrada ao final via `taskkill`): `/editorial`, `/editorial/editorias`, `/editorial/localidades`, `/editorial/midias`, `/editorial/materias`, `/editorial/materias/nova` → 200; `/editorial/materias/nao-existe` → 404; contagens conferidas no HTML servido (7 editorias, 4 localidades, 9 mídias); nenhum "Hydration failed"/"Application error"; matéria existente com galeria (`article-1245`) renderiza os 6 campos de legenda/crédito esperados (capa + 2 itens de galeria × 2 campos); matéria nova (sem mídia selecionada ainda) renderiza 0 campos de legenda/crédito, como esperado.
- Não alterado: `apps/site`, pipeline de extração de PDF (`@ir/pdf-extraction`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- Sem storage real: cadastrar mídia exige colar uma URL já hospedada (mesma limitação documentada desde a Fase 06); upload de arquivo fica para uma fase futura, explicitamente fora de escopo aqui.
- Vínculo mídia→matéria é somente leitura nesta tela (mostra onde a mídia é usada; não permite desvincular por aqui — a remoção acontece editando a matéria em si, em `ArticleForm.tsx`).
- Sem exclusão de editoria/localidade/mídia: consistente com o princípio de auditoria/rastreabilidade do Plano Mestre (Parte P) — inativar é a operação reversível oferecida; excluir permanentemente não foi pedido e quebraria matérias que já referenciam esses ids.
- Reordenação manual só para editorias (pedida explicitamente); localidades são organizadas por agrupamento (cidade/região/geral) + ordem alfabética, sem controle de ordem manual (não pedido).
- `npm audit` continua reportando vulnerabilidades transitivas (Tiptap desde a Fase 07); nenhuma ação nesta fase.

### Próxima fase

A decidir — possíveis caminhos: upload real de mídia (quando houver storage), cadastro central (pessoas/empresas), publicidade do portal, ou segmentação de layout bidimensional para o pipeline de PDF (Fase 11, limitação residual em páginas de grade densa). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 11 — ordem de leitura em diagramação mista (21/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `bbbd8db` (commit da Fase 10).
- Entrega: detecção de colunas **por região vertical da página** (não mais uma partição global única) — corrige a limitação documentada como Achado 2 da Fase 10 (diagramação mista: matéria larga ao lado de coluna estreita, ex.: horóscopo). Zero mudança em texto; só em como os blocos são agrupados em candidatos. Relatório atualizado em `docs/PDF-REAL-VALIDATION.md` (adendo no topo).

### O que mudou (`packages/pdf-extraction`)

- `types.ts`: `PageExtraction.columnRanges: Array<[number, number]>` (Fase 09/10) virou `columnSegments: ColumnSegment[]` (`{ yTop, yBottom, xStart, xEnd }`). Cada segmento continua se comportando, para o resto do pipeline (parágrafos, matérias, conservação), exatamente como uma "coluna" antiga — só passou a existir mais de um "conjunto de colunas" por página quando o layout muda de fato entre faixas.
- `columns.ts`: nova `detectColumnSegments(items, pageWidth, pageHeight)` — amostra a estrutura de colunas (reaproveitando `detectColumns`, a técnica de vão de tinta da Fase 09, sem mudança) em bandas horizontais de 70pt, funde bandas adjacentes com a mesma estrutura em uma única região, estende bordas até os limites da página. Nova `assignSegment(item, segments)` substitui `assignColumn` no pipeline. `detectColumns`/`assignColumn` originais **não foram alterados** — continuam existindo e são reaproveitados internamente por banda.
- **Achado de implementação (evitou uma regressão)**: comparar bandas pela borda externa (esquerda da primeira coluna, direita da última) fragmentava artificialmente até páginas de coluna única — um título mais curto que o corpo já muda a borda direita da "tinta" daquela banda o bastante para parecer uma "mudança de estrutura". Corrigido comparando só a posição dos **vãos internos** entre colunas (irrelevante para colunas únicas, que não têm vão interno nenhum) — robusto à borda naturalmente irregular de texto alinhado à esquerda/direita.
- `pipeline.ts`: troca `detectColumns`+`assignColumn` (nível de página) por `detectColumnSegments`+`assignSegment`; resto do pipeline (linhas → parágrafos → matérias → conservação) inalterado, pois já era genérico sobre um índice de "coluna".
- `conservation.ts`: **nenhuma mudança** — a checagem de "fora de ordem dentro do candidato" já operava por candidato, não por página inteira; continua válida sem alteração.

### Prova determinística — nova fixture sintética

`test/fixtures.ts` ganhou `buildMixedLayoutFixture` (matéria larga no topo e na base da página + faixa intermediária com coluna larga e coluna estreita lado a lado, exatamente o padrão do Achado 2) e `test/columnRegions.test.ts` (4 testes novos): a página resultante tem mais de uma região vertical; nenhum candidato mistura o marcador da matéria larga com o da coluna estreita; nenhum marcador se perde; conservação textual continua 100% (zero órfãos/duplicados/alterados/fora de ordem); uma página de estrutura uniforme (fixture da Fase 09) continua com uma única região (sem fragmentação artificial). 23/23 testes do pacote passando (19 já existentes da Fase 09/10 + 4 novos).

### Revalidação das 8 páginas reais da Fase 10 — sem regressão

`scripts/validate-real-pdfs.ts` reexecutado sobre as mesmas 8 páginas (permanente desde a Fase 10, sem mudança de código, só do resultado que produz). **Cobertura textual permanece 100% nas 8 páginas, zero órfãos, zero duplicados, zero alterados, zero fora de ordem** — idêntico à Fase 10, provando que a mudança de segmentação não introduziu nenhuma perda/duplicação/alteração.

O que mudou é a granularidade da segmentação (mais colunas/regiões, mais candidatos). Inspeção manual do conteúdo (não só das métricas) confirma que a maior parte é melhoria real: em 685/p12, 685/p18, 697/p20 e 699/p18, uma faixa de cabeçalho no topo da página (número de página + nome do jornal) agora é corretamente isolada em micro-candidatos próprios (sinalizados `possibleAdvertisement`, triviais de descartar), enquanto o corpo real da matéria permanece como um único candidato coeso e intacto — antes esse cabeçalho ficava implicitamente misturado na mesma coluna única da página inteira.

**Limitação residual, documentada, não forçada**: as duas páginas mais densas do lote (685/p4, a ata de câmara em grade; 685/p23, a coluna social/horóscopo) continuam com pelo menos um candidato que mistura texto de assuntos diferentes em uma sub-região específica — são grades genuinamente bidimensionais (a fronteira entre colunas muda a cada poucas linhas), não apenas 2-3 faixas verticais limpas, e resolver isso por completo exigiria segmentação de layout bidimensional real, fora do escopo de uma correção determinística pontual. Cobertura textual continua 100% mesmo nessas duas páginas — o problema remanescente é só de agrupamento/ordem de leitura numa sub-região, nunca perda ou invenção de texto. Detalhe completo em `docs/PDF-REAL-VALIDATION.md`.

### Validação

- `packages/pdf-extraction`: 23/23 testes (`npx tsx --test test/*.test.ts`, de dentro do pacote).
- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso.
- Comparação nas 8 páginas reais da Fase 10 via `scripts/validate-real-pdfs.ts`: sem regressão de conservação (ver acima).
- `apps/site` e o acervo de PDFs (`apps/site/public/uploads/jornal-online/`) confirmadamente sem alterações.

### Pendências e limitações conhecidas

- Páginas com diagramação em grade densa (685/p4, 685/p23) continuam com agrupamento imperfeito em pelo menos uma sub-região — ver acima e `docs/PDF-REAL-VALIDATION.md`. Resolver exigiria segmentação de layout bidimensional real, possivelmente com apoio de renderização visual da página.
- Constantes de tuning novas (`REGION_BAND_HEIGHT_PT = 70`, tolerância de fronteira `24pt`) foram calibradas contra as fixtures sintéticas e validadas contra as 8 páginas reais já conhecidas — não foram re-otimizadas especificamente para 685/p4 ou 685/p23 (isso seria ajustar a regra a duas páginas específicas, não uma regra geral).
- `npm audit` continua reportando vulnerabilidades transitivas (Tiptap desde a Fase 07); nenhuma ação nesta fase.

### Próxima fase

A decidir — possíveis caminhos: segmentação de layout bidimensional (se diagramação em grade densa se mostrar frequente no uso real), OCR real, ou outro módulo do Plano Mestre (editorias/localidades, publicidade, cadastro central). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 10 — validação com PDFs reais do jornal (20/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `4a6ca58` (commit da Fase 09).
- Entrega: prova de fidelidade do pipeline da Fase 09 contra 8 páginas reais escolhidas de 3 edições do acervo do JornalIR (7 PDFs, 24 páginas cada, 168 páginas inspecionadas para a escolha), mais uma nova camada independente de auditoria de conservação textual, integrada à revisão da Fase 08. Relatório completo em `docs/PDF-REAL-VALIDATION.md`.

### PDFs reais — só leitura

Localizados em `apps/site/public/uploads/jornal-online/` (`IR 685/687/696/697/698/699/700_compressed.pdf`, já usados pelo flipbook do portal). Nenhum foi alterado, movido ou reescrito — confirmado via `git status` sobre esse diretório antes do commit. Todas as 168 páginas têm camada de texto real (nenhuma página digitalizada/sem texto encontrada no acervo testado, então o caminho "sem OCR disponível" não foi exercitado com dados reais nesta fase — permanece coberto pelos testes sintéticos da Fase 09).

### Nova camada: conservação textual (`packages/pdf-extraction/src/conservation.ts`)

Auditoria independente — não confia no agrupamento em matérias, reconta do zero a partir do catálogo bruto de parágrafos da página:

- `Paragraph` ganhou `id` (`c{coluna}-p{índice}`) e `column`; `ArticleBlock` ganhou `paragraphId` apontando para o parágrafo de origem; `PageExtraction` ganhou `paragraphs: Paragraph[]` — o catálogo completo, base de verdade para a auditoria.
- `checkConservation(page)`: para cada parágrafo, verifica se foi usado em exatamente um bloco (órfão = 0 usos; duplicado = 2+ usos), se o texto do bloco bate exatamente com o do parágrafo de origem (alterado = não bate), e se a ordem dos blocos dentro de cada candidato respeita a ordem vertical dos parágrafos de origem na coluna (fora de ordem). Produz `blocksFound`, `blocksUsed`, `orphanBlocks`, `duplicatedBlocks`, `alteredBlocks`, `reorderedBlockIds`, `coverageByCount`, `coverageByChars` e avisos — nunca decide nem corrige nada.
- Rodada automaticamente ao final de `extractPage` no pipeline; os avisos entram na mesma lista de avisos da página (sem canal oculto).
- 5 testes novos (`test/conservation.test.ts`), incluindo cenários sintéticos deliberadamente quebrados (órfão, duplicado, alterado, fora de ordem) para provar que o checador realmente detecta cada categoria — não só um teste de "caminho feliz".

### Achados reais (via diagnóstico contra as 8 páginas) e correções aplicadas

Ver `docs/PDF-REAL-VALIDATION.md` para o relatório completo com tabela por página. Resumo:

1. **Cobertura textual: 100% em todas as 8 páginas reais testadas** — zero blocos órfãos, zero duplicados, zero alterados, zero fora de ordem. Confirma com dados reais a garantia estrutural do pipeline (nenhum caminho de código descarta um parágrafo silenciosamente).
2. **Achado real — mapeamento de fonte quebrado em títulos**: em 6 das 8 páginas, uma fonte de título do PDF de origem mapeia o glifo de "N" (e, em outra edição, "ã"/"h") para o Unicode minúsculo (`"APRESEnTA"`, `"CITADIn"`, `"GOVERnO"`, `"MOÇãO"`, `"GUILhERME"`...). Confirmado inspecionando os itens brutos do `pdfjs-dist`: o defeito já vem assim do PDF, não é introduzido pela junção de linhas. **Correção**: `hasIsolatedLowercaseInUppercaseRun` (novo, em `warnings.ts`) — detector determinístico por padrão de maiúscula/minúscula por palavra (nunca por conteúdo), com exclusão deliberada do plural comum de sigla ("PDFs"). Só sinaliza; nunca corrige a letra.
3. **Achado real — "título" implausivelmente longo**: na página 4, uma ata de câmara diagramada em grade densa produziu um parágrafo de 900+ caracteres que, por estar em fonte maior que o corpo, virava um "título" absurdo. **Correção**: `articleGroups.ts` só aceita um parágrafo como título quando tem no máximo 160 caracteres; acima disso, o grupo cai para baixa confiança (tudo mantido como corpo, sinalizado para revisão) — verificado antes/depois com o mesmo parágrafo real.
4. **Limitação real, documentada, não corrigida**: diagramação mista (matéria corrida ao lado de coluna estreita, ex.: horóscopo) pode embaralhar a ordem de leitura dentro de uma coluna mal segmentada pelo detector global de vãos — sem perda de texto (cobertura continua 100%), mas com risco de leitura confusa. Corrigir exigiria detecção de colunas por região vertical da página, mudança de algoritmo maior, fora do escopo desta fase de validação.
5. **Página inteira de publicidade com pouco texto**: comportamento correto, não uma falha — candidatos triviais e óbvios de descartar, a própria página já se rotula "Publicidade".

### Integração com a Fase 08 (interface)

- `ImportPageCoverage` (novo, em `@ir/types`) e `ImportCandidateExtraction.pageCoverage`: cada candidato carrega um retrato da cobertura da PÁGINA inteira (não só dele), calculado uma vez por página em `composition/pdfCandidateExtraction.ts` via `checkConservation` e compartilhado por todos os candidatos daquela página.
- `ImportCandidateReview.tsx`: nova linha discreta "Cobertura da página: X%" (com selo de aviso quando <100%) + alerta de risco de perda/ordem quando há blocos órfãos ou cobertura incompleta.
- `ImportCandidateList.tsx`: indicador discreto "X% cobertura" sob o número da página, por linha.

### Script de diagnóstico — permanente, reprodutível

`packages/pdf-extraction/scripts/validate-real-pdfs.ts`: lê as 8 páginas selecionadas (lista documentada com o motivo de cada escolha), roda `extractPdf` + `checkConservation`, imprime JSON. Não é descartável — fica no repositório para reexecução em fases futuras (`npx tsx scripts/validate-real-pdfs.ts`, de dentro do pacote).

### Validação

- `packages/pdf-extraction`: 19/19 testes (`npx tsx --test test/*.test.ts`, de dentro do pacote) — os 15 já existentes (Fase 09) continuam passando após o refactor de conservação, mais 5 novos de conservação, mais 4 novos do detector de maiúsculas/minúsculas.
- `npm run typecheck --workspace @ir/sistema`: sem erros. `npm run typecheck --workspace @ir/site`: sem erros (tipos compartilhados não quebraram o portal).
- `npm run build --workspace @ir/sistema`: sucesso, 19 rotas.
- Servidor de produção local (porta verificada livre antes, processo encerrado ao final): `/importar-pdf` 200, `/materias` 200 (não afetado).
- `apps/site` e o acervo de PDFs (`apps/site/public/uploads/jornal-online/`) confirmadamente sem alterações.

### Pendências e limitações conhecidas

- Diagramação mista (Achado 4 acima) — recomendação registrada em `docs/PDF-REAL-VALIDATION.md` para uma fase futura, se o padrão se mostrar frequente no uso real.
- Nenhuma página sem camada de texto foi encontrada no acervo testado — o caminho de OCR (interface pronta desde a Fase 09, sem implementação real) permanece validado apenas por fixture sintética.
- `npm audit` continua reportando vulnerabilidades transitivas (Tiptap, desde a Fase 07); nenhuma ação nesta fase.

### Próxima fase

A decidir — possíveis caminhos: detecção de colunas por região vertical (se a diagramação mista se mostrar frequente), OCR real, ou outro módulo do Plano Mestre (editorias/localidades, publicidade, cadastro central). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 09 — extração real de PDF com fidelidade textual (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `3dfa5e4` (commit da Fase 08).
- Fase crítica. Entrega: o gerador mock de candidatos (Fase 08) foi **substituído** por leitura real de PDF — extração de texto por camada (pdfjs-dist), detecção de colunas por layout, agrupamento em parágrafos/matérias por tamanho de fonte e posição, e rastreabilidade completa até página/coluna/bloco em cada candidato. Nenhum texto é inventado, resumido ou reescrito.

### Pipeline — novo pacote isolado `@ir/pdf-extraction`

`PDF → páginas → blocos com coordenadas → agrupamento (linhas → parágrafos → matérias) → candidatos`, exportado por `extractPdf(bytes, options?)`. Módulos:

- `pdfjsNode.ts` — único ponto que faz `require("pdfjs-dist/legacy/build/pdf.js")` (build "legacy", roda em Node sem worker real) e resolve `standardFontDataUrl`/`cMapUrl` para as métricas de fonte locais do próprio pacote. **Achado importante**: sem essas métricas, pdfjs relata larguras erradas para as fontes padrão (Helvetica etc.) usadas pelo pdf-lib, distorcendo toda a extração de posição — corrigido apontando `standardFontDataUrl`/`cMapUrl` para `node_modules/pdfjs-dist/{standard_fonts,cmaps}`.
- `textLayer.ts` — abre o documento e extrai itens de texto com posição (x, linha de base) e tamanho de fonte, convertidos para espaço de página com origem no topo-esquerda.
- `columns.ts` — detecta colunas por **vãos de tinta**: um histograma de cobertura horizontal da página inteira; vãos sem nenhum texto em toda a extensão vertical viram fronteiras de coluna. Técnica de análise de layout, não de conteúdo.
- `lines.ts` — agrupa itens em linhas por proximidade vertical (dentro de uma coluna já atribuída); junta itens da mesma linha com espaço só quando há vão horizontal real entre eles.
- `paragraphs.ts` — agrupa linhas em parágrafos: duas linhas só ficam juntas quando têm o **mesmo tamanho de fonte** e o vão vertical não é maior que o normal da coluna. A mediana do "vão normal" considera apenas pares de mesmo tamanho de fonte (ver "Achados e correções" abaixo).
- `articleGroups.ts` — segmenta os parágrafos de uma coluna em candidatos a matéria (parágrafo em fonte maior que o corpo após já haver corpo acumulado, ou vão vertical muito maior que o normal) e classifica título/subtítulo/corpo pela hierarquia de tamanho de fonte. Sem hierarquia clara, mantém tudo como corpo e sinaliza baixa confiança — nunca adivinha.
- `images.ts` — conta imagens candidatas por página via `page.getOperatorList()` (operadores `paintImageXObject`/`paintImageMaskXObject` e suas variantes "Repeat"), sem extrair pixels.
- `ocr.ts` — interface `OcrProvider` + `NullOcrProvider` (padrão, sempre indisponível). Ver decisão sobre OCR abaixo.
- `warnings.ts` — sinaliza caracteres suspeitos (substituição Unicode `�`, caracteres de controle inesperados) sem tentar corrigi-los.
- `pipeline.ts` — orquestra tudo por página; decide `textLayer`/`ocr`/`unavailable` conforme a página tem ou não camada de texto e conforme o `OcrProvider` está disponível.

### Achados e correções durante a implementação (documentados para não serem re-descobertos)

1. **Texto truncado na borda direita da página**: pdfjs-dist (build legacy, sem `canvas` instalado) corta a extração de um item de texto exatamente no ponto em que ele ultrapassaria a largura da página — mesmo com a string completa presente no content stream (confirmado inspecionando o stream bruto). Isso só afeta texto que **extrapola** a página (nunca acontece em um PDF real bem diagramado, cujo texto sempre cabe dentro da margem). Testado e confirmado: instalar o pacote `canvas` **não** resolve (o comportamento é o mesmo com ou sem ele) — não é a ausência do polyfill de `DOMMatrix`/`Path2D` que causa isso. Não investigado a fundo além disso, por não afetar documentos reais; fixtures de teste foram ajustadas para larguras realistas.
2. **"Moda" por contagem de parágrafos falha com poucas amostras**: calcular o tamanho de fonte do corpo como o mais frequente **por número de parágrafos** falha exatamente no caso comum de uma página com só uma matéria (um título, um subtítulo, um corpo — empate de 1 parágrafo cada, e o desempate por ordem de inserção pegava o título). Corrigido para ponderar por **total de caracteres**: corpo de texto real sempre acumula muito mais caracteres que título/subtítulo, então esse critério é robusto mesmo com poucas amostras.
3. **Mediana "poluída" por vãos heterogêneos**: os limiares de quebra de parágrafo e de quebra de matéria, calculados a partir da mediana dos vãos observados na coluna, ficavam artificialmente altos quando a amostra misturava vãos de natureza diferente (vão título→corpo, vão entre parágrafos, vão entre matérias). Corrigido em dois lugares: (a) o vão "normal" de parágrafo agora só considera pares de linhas do **mesmo tamanho de fonte**; (b) o limiar de quebra de matéria agora é proporcional ao **tamanho da fonte do corpo** (`bodyFontSize × 3.5`), não a uma estatística dos próprios vãos — evita circularidade quando a transição entre matérias é uma das poucas amostras disponíveis.
4. **Interoperabilidade CJS/ESM inconsistente em scripts de validação ad hoc**: ao importar os mesmos arquivos de `apps/sistema` a partir de dois caminhos relativos diferentes num script de teste solto, o Node (via `tsx`) instanciou o módulo de composição **duas vezes** (dois `importCandidateService` distintos) — um artefato específico de como `apps/sistema/package.json` (sem `"type": "module"`) e `packages/pdf-extraction/package.json` (`"type": "module"`) resolvem módulos de forma diferente conforme o caminho de chamada. Não afeta o app real (Next.js/webpack usa um único grafo de módulos). Corrigido no pacote com `pdfjsNode.ts` usando `require()` explícito (não `import` ESM) para o próprio pdfjs-dist, e nos scripts de validação importando tudo por um único caminho.

### Decisão sobre OCR — não implementado nesta fase

Renderizar uma página para imagem em Node exige um canvas nativo (`canvas` ou `@napi-rs/canvas`) e um motor de OCR real (`tesseract.js`, que baixa dados de idioma em tempo de execução — risco de rede indisponível no ambiente de execução). Optou-se por **não** adicionar essas dependências nesta fase: o risco (dependência binária/nativa, download em runtime) não se justifica frente à prioridade explícita desta fase (fidelidade da camada de texto). `OcrProvider` é uma interface real e testada — uma implementação completa pode ser adicionada depois sem mudar o pipeline. Testado: `page com texto` nunca aciona OCR; `página sem texto` com um provedor fake disponível usa o resultado dele, claramente marcado como não-exato (percentual de confiança no aviso); sem provedor disponível, a página é reportada como `unavailable` com aviso explícito, nunca com texto inventado.

### Detecção de publicidade e de continuação entre colunas — heurísticas, não certezas

- **Publicidade**: um grupo de parágrafos isolado por vãos maiores que o limiar de quebra de matéria em ambos os lados, com poucos caracteres (≤ 220), é marcado `possibleAdvertisement: true` e gera aviso — nunca descartado automaticamente. Avaliada e descartada a alternativa de detectar retângulos vetoriais (bordas) via `getOperatorList()`: exigiria rastrear a matriz de transformação corrente (pilha de `save`/`restore`/`transform`) para converter coordenadas de operador em espaço de página, complexidade não justificada frente ao critério de isolamento espacial, que já cobre o caso pedido (anúncio visualmente separado do conteúdo editorial).
- **Continuação entre colunas**: o último parágrafo de um grupo sem pontuação de fechamento (`.`, `!`, `?`, aspas de fechamento) é marcado `possibleContinuation: true`. A **fusão em si não é automática** — o revisor usa a ação "Mesclar" já existente desde a Fase 08 para combinar os dois candidatos depois de ver o aviso. Decisão deliberada: detectar a separação corretamente é seguro; inferir automaticamente qual candidato futuro é a continuação certa cruzaria para "adivinhar", contra a regra principal desta fase.

### Integração com a Fase 08

- `ImportCandidateService.generateMockBatch` renomeado para `createBatch` (o método passou a ser genuinamente usado com dados reais, não só mock; nenhuma outra mudança de comportamento).
- `packages/mocks/src/editorial/import-candidate-generator.mock.ts` **removido** — o mock foi substituído, não mantido em paralelo.
- `ImportCandidate` (em `@ir/types`) ganhou `extraction?: ImportCandidateExtraction` (método, dimensões da página, blocos de origem com posição, avisos, e os três sinalizadores de confiança). Campo opcional: candidatos futuros não vindos de PDF (se algum dia existirem) simplesmente não o preenchem.
- `apps/sistema/src/composition/pdfCandidateExtraction.ts` (novo): único ponto que decide qual provider de extração usar e traduz `ArticleGroup`/`PageExtraction` (formato do pipeline) em `NewImportCandidateRecord` (formato do domínio) — corpo vira HTML (`<p>` por parágrafo, mesma convenção da Fase 07), mantendo a régua "nenhuma tela ou Server Action importa outra coisa que não os serviços já compostos".
- `GenerateCandidatesForm.tsx`: agora envia o arquivo de verdade (via `FormData`, chamada direta à Server Action — sem `<form action>` nem upload persistente) em vez de só mostrar o nome escolhido.
- `importar-pdf/actions.ts`: `generateCandidates` passou a receber `FormData`, valida que é um PDF, lê os bytes (`file.arrayBuffer()`, nunca gravados em disco) e delega à extração real; retorna contagem de candidatos, páginas e páginas sem camada de texto.
- `ImportCandidateReview.tsx`: nova seção "Comparar com a origem" mostrando o método de extração, os avisos de confiança do candidato, e um `ImportCandidateSourcePreview.tsx` novo — um SVG leve com a posição de cada bloco de origem na página (sem renderizar o PDF em si, que exigiria mantê-lo além da requisição de extração; ver limitações).
- `ImportCandidateList.tsx`: indicador "⚠ N aviso(s) de confiança" por linha, quando o candidato tiver avisos.

### Next.js — configuração necessária para pdfjs-dist em Server Action

`apps/sistema/next.config.mjs` ganhou `experimental.serverComponentsExternalPackages: ["pdfjs-dist"]`: sem isso, o webpack tenta empacotar as detecções dinâmicas de ambiente do pdfjs-dist e falha/se comporta de forma inconsistente. Com a configuração, o pacote fica como dependência externa do runtime do servidor (Node nativo cuida do `require`), exatamente como já acontece implicitamente quando se roda um script Node puro.

### Testes de fidelidade — `packages/pdf-extraction/test/` (`tsx --test`, sem framework novo)

Fixtures geradas em código via `pdf-lib` (não binários versionados) — texto de origem conhecido, comparado por igualdade exata (`assert.deepEqual`/`assert.equal`), nunca por aproximação:

| # | Fixture | O que valida | Resultado |
| --- | --- | --- | --- |
| 1 | Uma coluna (título + corpo em 2 parágrafos, com imagem embutida) | Correspondência exata de título e dos dois parágrafos; 1 coluna detectada; `imageCount === 1` (imagem não bloqueia o candidato) | ✅ exato |
| 2 | Duas colunas independentes | 2 colunas detectadas; cada matéria isolada na sua coluna; texto de uma não vaza para a outra | ✅ exato |
| 3 | Título + subtítulo + corpo | Classificação correta dos três papéis por tamanho de fonte | ✅ exato |
| 4 | Caracteres acentuados + linha fragmentada em 2 itens de texto | Acentuação preservada exatamente; junção correta de dois itens de texto em uma linha (espaço nem perdido nem duplicado); zero avisos de caractere suspeito para texto legítimo | ✅ exato |
| 5 | Bloco isolado entre duas matérias (publicidade) | 3 grupos distintos; texto do bloco isolado não aparece em nenhuma das matérias vizinhas; `possibleAdvertisement: true` só no bloco isolado | ✅ exato + sinalização correta |
| 6 | Matéria continuando em outra coluna | 2 candidatos separados (nenhuma fusão automática); `possibleContinuation: true` na coluna 1; texto das duas colunas, concatenado, reconstitui a frase original exatamente (nada perdido/duplicado na fronteira) | ✅ exato + sinalização correta |
| 7 | Página sem camada de texto | Sem OCR disponível: `method: "unavailable"`, zero candidatos, aviso explícito (não inventa texto); com um `OcrProvider` fake disponível: usa o resultado, marcado como baixa confiança, aviso cita o percentual — nunca tratado como exato | ✅ comportamento correto (não aplicável "exatidão" para OCR, conforme pedido) |

10/10 testes (`npx tsx --test test/extraction.test.ts test/pipeline.test.ts`, executados de dentro de `packages/pdf-extraction`).

**Testes que o conjunto acima detectaria** (conforme pedido): palavra perdida ou duplicada → comparação exata de string falha; troca de ordem → comparação exata de string (ordem faz parte do conteúdo) falha; parágrafo misturado → teste 5/6 falhariam (texto cruzando fronteiras); caractere alterado → comparação exata de string falha, e o teste 4 adicionalmente falharia se `�`/controle aparecessem.

### Validação de integração (camada de composição real, não só o pacote isolado)

Script `tsx` temporário (removido ao final, nunca commitado) gerou um PDF real via `pdf-lib`, chamou `extractCandidatesFromPdf` (a mesma função que a Server Action chama) contra a composição real de `apps/sistema`, e seguiu o fluxo completo — **16/16 asserções**: extração real gera candidato correto (título/corpo com acentos, exatos); vínculo `editionId`/`pageNumber` preservado; candidato nasce `pending` com `extraction` presente e `method: "textLayer"`; revisão manual (`keep`) funciona sobre candidato real; conversão sempre gera rascunho (`status: "draft"`), preserva título e vínculo edição/página; matéria aparece em `ArticleService.list()`.

### Validação de renderização real

`npm run typecheck`/`build --workspace @ir/sistema`: sem erros; 19 rotas, `/importar-pdf` e `/importar-pdf/[candidateId]` dinâmicas. `npm run typecheck --workspace @ir/site`: sem erros (tipos compartilhados não quebraram o portal). Servidor de produção local (porta verificada livre antes, processo encerrado ao final): `/importar-pdf` 200, `/importar-pdf?edicao=edition-2026-038` 200, `/importar-pdf/nao-existe` 404, `/materias` 200 (não afetado). `apps/site` confirmadamente sem alterações.

### Pendências e limitações conhecidas

- **Sem OCR real** — interface pronta, decisão de não implementar motor real documentada acima. Revisitar quando houver clareza sobre disponibilidade de rede em produção para baixar dados de idioma, ou disposição para depender de um binário nativo.
- **Sem renderização visual do PDF na revisão** — o preview mostra as posições dos blocos (SVG), não a página em si; renderizar a página exigiria manter o arquivo além da requisição de extração (o PDF é hoje inteiramente transitório, nunca persistido), o que cruzaria para "storage", fora do escopo desta fase.
- **Extração de imagens é só contagem** — sem bbox nem associação por bloco; extrair a posição exigiria rastrear a matriz de transformação corrente do operador list (não implementado, avaliado como não essencial frente à fidelidade textual).
- **Heurísticas de publicidade/continuação são sinalizadores, não certezas** — sempre revisáveis pelo humano, nunca decidem sozinhas.
- **`npm audit` continua reportando vulnerabilidades transitivas** (Tiptap desde a Fase 07); nenhuma ação nesta fase, consistente com "não atualizar stack sem necessidade".

### Próxima fase

A decidir — possíveis caminhos: OCR real (se/quando a infraestrutura permitir), extração de imagens com posição, ou avanço para outro módulo do Plano Mestre (cadastro de editorias/localidades, publicidade, cadastro central). Ainda sem Supabase, autenticação real, upload remoto/storage ou IA.

---

## Fase 08 — importação de PDF / revisão de candidatos (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `817c386` (commit da Fase 07).
- Entrega: fluxo completo de importação simulada — selecionar edição, simular seleção de PDF, gerar candidatos mock, revisar (manter/descartar/editar/mesclar/dividir) e converter em rascunho real via `ArticleService`. Nenhum parser/OCR real; `apps/site` não foi tocado.

### `packages/types`

`ImportCandidate` ganhou `suggestedLocalityId?`, `mergedIntoId?` (referência de rastreabilidade quando descartado por mesclagem — nunca apagamos o registro) e `createdAt`. Nenhuma mudança nos demais tipos.

### `packages/core` — dois serviços novos, simétricos aos existentes

- `NewspaperEditionRepository`/`NewspaperEditionService` (somente leitura) — necessário para listar edições existentes na tela sem importar `@ir/mocks` diretamente.
- `ImportCandidateRepository` (`list`/`getById`/`create`/`createMany`/`update`) e `ImportCandidateService`, que depende do `ArticleService` já existente (mesmo padrão de composição entre serviços já usado por `ArticleService` com `EditorialSectionRepository`/`LocalityRepository`):
  - `generateMockBatch` — recebe os registros já prontos (a decisão de COMO gerá-los é do provider/composição, não do core).
  - `keep` — salva os ajustes da revisão, candidato continua `pending`.
  - `discard` — status `discarded`; nunca cria matéria.
  - `merge(primaryId, secondaryIds)` — concatena corpo/mídia sugeridos dos secundários no principal; secundários viram `discarded` com `mergedIntoId` (sem exclusão destrutiva, rastreável).
  - `split(id)` — divide o corpo em dois candidatos. Sem parser real: corta em blocos HTML de nível superior (`</p>`, `</h3>`, `</blockquote>`, `</ul>`, `</ol>`) e reparte pela metade; sem blocos identificáveis (texto puro), reparte a string pela metade dos caracteres. A soma das duas partes reconstitui o corpo original.
  - `convertToDraft` — sempre chama `articleService.importAsDraft` (força `status: "draft"`); rejeita quando não há editoria (nem sugerida, nem escolhida na revisão) ou localidade, preservando a regra "toda matéria tem editoria" também para conteúdo importado. Mantém `editionId`/`editionPageNumber` (o segundo pode ser corrigido na revisão antes de converter).
- `ArticleService` **não foi alterado nesta fase**.

### `packages/mocks`

- 2 edições adicionais em `newspaperEditions` (037 e 039, além da 038 já existente) — só para a seleção de edição na tela ter sentido real.
- `createImportCandidateRepositoryMock` — começa **vazio** de propósito: o fluxo descrito (selecionar edição → selecionar PDF → gerar candidatos) só faz sentido se não houver nada pré-carregado.
- `createNewspaperEditionRepositoryMock`.
- `generateMockImportCandidates(editionId)` — lote fixo de 4 candidatos plausíveis: um sem editoria/localidade sugeridas (publicidade disfarçada de matéria, para demonstrar o descarte), um com dois parágrafos (para demonstrar a divisão), e dois candidatos comuns de política/esporte.

### `apps/sistema`

- `composition/editorial.ts`: `newspaperEditionService`, `importCandidateService` e `generateCandidatesForEdition(editionId)` — esta última é o único lugar do app que decide *qual* gerador mock usar, mantendo `@ir/mocks` fora de páginas e Server Actions.
- `lib/simulatedAudit.ts`: constante `SIMULATED_AUDIT` extraída de `materias/actions.ts` (pequena limpeza, mesma identidade simulada reaproveitada pelas novas Server Actions).
- `app/sistema/editorial/importar-pdf/page.tsx` — Server Component; edição selecionada via `searchParams.edicao` (formulário GET nativo, sem JS) para não obrigar client state só para navegar entre edições. Sem edição selecionada: só o seletor. Com edição e sem candidatos: `GenerateCandidatesForm`. Com candidatos: `ImportCandidateList` (e um `<details>` para gerar um novo lote sem perder o que já existe).
- `app/sistema/editorial/importar-pdf/actions.ts` — `generateCandidates`, `discardCandidate`, `mergeCandidates`, `splitCandidate`, `keepCandidate`, `convertCandidate`. **Diferença deliberada do padrão das Fases 06/07**: nenhuma dessas ações chama `redirect()` internamente — todas retornam `{ error }` ou um resultado (`{ ok: true, articleId }`, etc.) e quem decide navegar é o componente cliente que a chamou, porque as mesmas ações são usadas tanto na lista (ação rápida, permanece na mesma página) quanto na revisão detalhada (navega para a lista ou para a matéria criada). Documentado aqui para não ser confundido com inconsistência.
- `app/sistema/editorial/importar-pdf/[candidateId]/page.tsx` — Server Component; converte `ImportCandidateNotFoundError` em `notFound()`, mesmo padrão das Fases 05/06.
- `features/editorial/GenerateCandidatesForm.tsx` — `<input type="file" accept="application/pdf">` cujo único efeito é mostrar o nome do arquivo escolhido; nada é lido ou enviado. O botão "Gerar candidatos" é o que de fato aciona a Server Action mock.
- `features/editorial/ImportCandidateList.tsx` — tabela densa (mesmo padrão visual de `MateriasList`, sem cards): checkbox por candidato pendente para seleção múltipla, "Mesclar selecionados", e por linha: Abrir, Converter, Descartar (ou "Ver rascunho" quando já convertido; nota "Mesclado em: …" quando descartado por mesclagem).
- `features/editorial/ImportCandidateReview.tsx` — reaproveita integralmente `ArticleBodyEditor` (Fase 07) para o corpo e `ArticleMediaPicker` (Fase 06) para capa/galeria, inicializado a partir de `suggestedMediaAssetIds` via novo helper `suggestedIdsToArticleMedia`. Campos: título, subtítulo, corpo, editoria, localidade, página da edição; mostra também uma fileira somente-leitura "Sugeridas pela importação" com as imagens que o (simulado) processamento indicou, distinta da seleção final ajustável. Ações: Manter, Converter em rascunho, Dividir candidato, Descartar — as duas últimas navegam de volta à lista da edição; converter navega para a matéria recém-criada.
- `EditorialOverview.tsx`: novo link "Importar do jornal impresso" ao lado de "Ver matérias".

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 19 rotas; `/importar-pdf` e `/importar-pdf/[candidateId]` dinâmicas (a segunda com ~207 kB de First Load JS, por reaproveitar o editor Tiptap da Fase 07).
- Validação de negócio (script `tsx` temporário, removido ao final, nunca commitado), reproduzindo os mesmos serviços da composição real — **32/32 asserções**, cobrindo exatamente os pontos pedidos: geração do lote mock (4 candidatos, todos pendentes, na edição certa); candidato de publicidade sem editoria sugerida presente no lote; **descartar** (status `discarded`, nunca ganha `createdArticleId`, nenhuma matéria criada); **converter** (sempre `draft`, `origin: "pdfImport"`, vínculo `editionId`/`editionPageNumber` preservado, editoria sugerida usada quando não sobrescrita, candidato muda para `converted` com `createdArticleId`); conversão sem editoria (nem sugerida nem escolhida) rejeitada; **mesclar** (corpo combinado, secundário descartado com `mergedIntoId`, nunca apagado); **dividir** (duas partes pendentes, vínculo edição/página preservado na segunda parte, soma das partes reconstitui o corpo original); página vinculada corrigida manualmente na revisão é a que vale na conversão final.
- Validação de renderização real (`next start`, porta 3001, processo verificado livre antes de iniciar e encerrado ao final): `/importar-pdf` sem edição 200; `/importar-pdf?edicao=edition-2026-038` 200, com as 3 edições listadas no seletor e mensagem correta de "nenhum candidato ainda"; `/importar-pdf/nao-existe` 404; nenhum "Hydration failed" ou erro de aplicação.
- **Limite desta validação**: como nas Fases 06/07, sem ferramenta de automação de navegador nesta sessão — os cliques de mesclar/dividir/converter na interface não foram exercidos em um browser de verdade, apenas a lógica de negócio (script acima) e a renderização inicial via SSR. Recomenda-se um teste manual rápido no navegador.
- Não alterado: `apps/site` (flipbook, leitor, Google Drive, acervo preservados), IndexedDB legado, anúncios/patrocinadores, `ArticleService`.

### Pendências e decisões

- Mesclagem concatena corpo/mídia de forma simples (sem interface de "escolher qual título prevalece" além do que já está no candidato principal); dividir usa um corte automático pela metade dos blocos HTML, não um ponto escolhido manualmente pelo revisor — ambos suficientes para demonstrar o fluxo mock, mas não são heurísticas sofisticadas (não é o objetivo desta fase).
- `NewspaperEditionService`/`NewspaperEditionRepository` são somente leitura; cadastro de novas edições continua fora de escopo.
- Sem aviso de alterações não salvas na tela de revisão do candidato (diferente do `ArticleForm` na Fase 07) — não pedido nesta fase, mantido fora para não expandir o escopo.

### Próxima fase

A decidir — possíveis caminhos: cadastro de editorias/localidades (`/sistema/editorial/editorias`, `/localidades`), tela de mídias (`/sistema/editorial/midias`), ou avanço para outro módulo do Plano Mestre (cadastro central, publicidade). Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

## Fase 07 — editor editorial de texto (19/09/2026)

- Branch: `feature/jornalir-core-foundation-20260917`.
- HEAD ao iniciar a fase: `d5f3b29` (commit da Fase 06).
- Entrega: título/subtítulo ganham controle discreto de formatação; o corpo passa a usar um editor de texto funcional (Tiptap/ProseMirror) no lugar do textarea simples; aviso de alterações não salvas ao sair da edição.

### Título e subtítulo — controle discreto, não um editor livre

- Novo tipo `EditorialTextStyle` (`bold`, `italic`, `size: "default"|"large"|"xlarge"`, `emphasis: "normal"|"medium"|"strong"`) em `packages/types/src/editorial/index.ts`, com `Article.titleStyle?`/`Article.subtitleStyle?` opcionais. Título e subtítulo continuam campos de texto simples (`string`); o estilo é metadado separado, nunca marcação dentro da string — evita que a listagem (Fase 05) ou qualquer outro consumidor de `article.title` passe a exibir HTML literal.
- `TextStyleControl.tsx`: um `<details>`/`<summary>` nativo ("Aa") ao lado do rótulo do campo, com dois toggles (negrito/itálico) e dois selects (tamanho, peso/ênfase) — sem fonte livre, sem cor livre, exatamente as opções limitadas do Plano Mestre (Parte C, item 7).
- `textStyle.ts`: `DEFAULT_TEXT_STYLE`, `textStyleToCss` (converte o estilo em `CSSProperties` aplicado inline no `<input>`, com tamanhos em px distintos para título/subtítulo) e `isDefaultTextStyle` — usada pelas Server Actions para não persistir o estilo quando é igual ao padrão, mantendo os dados enxutos e as matérias antigas (sem esse campo) visualmente equivalentes.
- **Correção necessária**: as regras `.field-title-input`/`.field-subtitle-input` em `globals.css` usavam `font-size: ... !important`, que bloquearia qualquer `style` inline (CSS `!important` de folha de estilos vence estilo inline). Removido — o estilo inline agora controla peso/itálico/tamanho, a classe cuida apenas de fonte/cor base.

### Corpo — editor funcional leve

- Novas dependências em `apps/sistema/package.json`: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-text-align` (resolvidas em `2.27.3`). Tiptap é headless (sem UI própria), por isso a barra de ferramentas em `ArticleBodyEditor.tsx` é inteiramente nossa, no mesmo padrão visual do shell (sem Tailwind, sem biblioteca de UI pronta).
- Recursos habilitados, exatamente os pedidos — negrito, itálico, subtítulo interno (heading nível 3, único nível liberado), listas com marcadores e numeradas, link (com prompt para URL, sem abrir ao clicar durante a edição), citação, alinhamento esquerda/centro/justificado, desfazer/refazer. `strike`, `code`, `codeBlock` e `horizontalRule` do `StarterKit` foram explicitamente desativados para não abrir formatação além do escopo pedido.
- `Article.body` continua `string` — agora HTML gerado pelo editor (`editor.getHTML()`). Nenhuma mudança de tipo; compatível com o contrato de importação de PDF já existente (`ImportCandidate.suggestedBody?: string`).
- `immediatelyRender: false` no `useEditor` evita divergência entre o HTML renderizado no servidor e no cliente (armadilha documentada do Tiptap com Next.js App Router); a área do corpo mostra "Carregando editor…" até a hidratação — confirmado via HTML de produção (sem "Hydration failed" nem erro de aplicação).
- Conteúdo mock antigo (texto puro, sem tags) continua abrindo normalmente: o parser HTML do ProseMirror envolve texto solto em um parágrafo padrão: comportamento documentado da biblioteca, confirmado na validação de negócio abaixo.

### `packages/core` — extensão mínima (sem alterar regras)

- `CreateArticleInput` (em `article-service.ts`) ganhou `titleStyle?`/`subtitleStyle?` opcionais, repassados para o registro criado por `saveDraft`. Nenhum outro método do `ArticleService` foi alterado — `updateDraft` já aceitava esses campos de forma genérica (`ArticleChanges = Partial<Omit<Article, ...>>`), sem precisar de código novo.

### UX — aviso de alterações não salvas

- `ArticleForm.tsx`: snapshot dos valores iniciais calculado uma vez (`useState` com inicializador lazy) comparado a cada render para derivar `isDirty`. Um listener de `beforeunload` bloqueia fechar a aba/atualizar quando há alterações não salvas.
- O link "Voltar à listagem" saiu do `ModuleHeader` das páginas (que não têm acesso ao estado do formulário) e virou um botão dentro do próprio `ArticleForm`, que confirma com o usuário antes de navegar quando há alterações pendentes.
- Escopo conhecido e documentado: a navegação pela barra lateral (`AdminSidebar`) não é interceptada — exigiria um contexto global de "formulário sujo" ou um guard de rota, fora do escopo desta fase. `beforeunload` também não cobre o botão "voltar" do navegador em navegação client-side do App Router (não dispara evento de unload real).

### Validação

- `npm run typecheck --workspace @ir/sistema`: sem erros.
- `npm run build --workspace @ir/sistema`: sucesso, 18 rotas; `/materias/nova` e `/materias/[id]` cresceram de ~100 kB para ~198 kB de First Load JS (bundle do Tiptap/ProseMirror, esperado para um editor rico).
- Validação de negócio (script `tsx` temporário, removido ao final, nunca commitado), reproduzindo os mesmos serviços da composição real — 14/14 asserções: corpo HTML (negrito/itálico/lista/link/citação/alinhamento) salvo e recuperado sem alteração; estilo de título/subtítulo persistido corretamente; reabrir preserva corpo e estilo; editar sobrescreve o corpo mantendo o restante; publicar preserva corpo/estilo; matéria mock antiga (`article-1243`, texto puro) continua com o corpo intacto e sem `titleStyle`; edição continua obrigatória.
- Validação de renderização real (`next start`, porta 3001, processo encerrado ao final): `/materias/nova`, `/materias/article-1245` (com conteúdo pré-existente) e `/materias/article-1243` (corpo em texto puro) retornam 200; `/materias/nao-existe` 404; nenhum "Hydration failed" ou "Application error" no HTML; título pré-preenchido corretamente; barra de ferramentas do editor (8 botões com `aria-label`) presente na resposta do servidor; placeholder "Carregando editor…" presente (confirma `immediatelyRender: false` funcionando); botão "Voltar à listagem" e os dois controles "Aa" (título/subtítulo) presentes uma única vez cada, como esperado.
- **Limite desta validação**: sem ferramenta de automação de navegador disponível nesta sessão (verificado: playwright/puppeteer não instalados), a interação real da barra de ferramentas do editor (cliques, atalhos, diálogo de confirmação ao sair) não foi exercida em um browser de verdade — apenas por leitura de código, pela renderização SSR acima e pela validação de negócio na camada de serviço. Recomenda-se um teste manual rápido no navegador antes de considerar a fase definitivamente encerrada para uso real da redação.
- Não alterado: portal (`apps/site`), IndexedDB legado, flipbook, jornal digital, anúncios/patrocinadores.

### Pendências e decisões

- `npm install` reportou vulnerabilidades de auditoria na nova árvore de dependências do Tiptap (transitivas); nenhum `npm audit fix` foi executado nesta fase — decisão consistente com "não atualizar stack sem necessidade" das fases anteriores. Revisar oportunamente.
- Sem confirmação de saída para navegação pela barra lateral (ver UX acima) — limite documentado, não implementado.
- Título/subtítulo ainda não suportam fonte livre (fora do pedido: "fonte entre opções autorizadas" do Plano Mestre menciona fonte, mas a Fase 07 não pediu esse controle explicitamente; não implementado para não expandir além do solicitado).

### Próxima fase

Importação de PDF (candidatos, revisão, mesclar/dividir, vínculo com edição) — a estrutura de `ImportCandidate` e `Article.body`/`titleStyle` já é compatível. Ainda sem Supabase, autenticação real, upload remoto ou OCR/PDF real.

---

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
