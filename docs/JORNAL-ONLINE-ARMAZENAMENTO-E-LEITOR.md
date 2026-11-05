# Jornal Online — armazenamento, capas, leitor e importação

Decisão registrada em 12/10/2026.

## Decisão principal

O PDF oficial de cada edição nova será armazenado no **Cloudflare R2**, usando a mesma infraestrutura R2 já existente no projeto. No início, os arquivos podem ficar no bucket atual sob o prefixo:

`jornal-online/{ano}/edicao-{numero}/...`

O código já aceita, sem refatoração futura, um bucket exclusivo através de `R2_EDITIONS_BUCKET` e `R2_EDITIONS_PUBLIC_BASE_URL`.

**Supabase/Postgres guarda somente metadados** da edição: número, data, título, quantidade de páginas, URL pública, chave do R2, tamanho, SHA-256 e URL/chave da capa. O PDF nunca deve ser salvo como bytea/base64 no banco.

## Por que R2

- O Jornal Online é conteúdo público e será lido muitas vezes.
- R2 é compatível com S3 e adequado para objetos grandes.
- O tráfego de saída direto do R2 não tem cobrança de egress.
- A infraestrutura do projeto já usa R2 para outras mídias.
- PDF e capa podem usar URLs permanentes; não dependemos de links temporários do Google Drive.

## Regra importante de upload

**Não enviar PDF grande através de Server Action/API da Vercel.**

O limite de corpo de uma Vercel Function é 4,5 MB, mesmo que o Next.js aceite um `bodySizeLimit` maior. Portanto, o fluxo de produção será:

1. Operador seleciona/cria a edição.
2. Navegador pede ao sistema uma autorização curta para aquela edição.
3. Sistema devolve uma URL PUT pré-assinada do R2.
4. Navegador envia o PDF **diretamente para o R2**.
5. Navegador gera a capa a partir da página 1 com PDF.js e envia a capa ao R2.
6. Sistema faz HEAD/validação do objeto e grava os metadados em `newspaper_editions`.
7. A mesma edição passa a alimentar:
   - Jornal Online;
   - leitor desktop/mobile;
   - importação e extração de matérias.
8. Não existe segundo upload do mesmo PDF.

Para PDFs normais do jornal (abaixo de ~100 MB), PUT único é suficiente. Se o acervo tiver arquivos maiores ou conexão instável, migramos o mesmo fluxo para multipart/resumível.

## Capa

O acervo não usará mais `<embed>` do PDF para tentar mostrar a primeira página.

Durante o upload, o navegador:
- abre o PDF com PDF.js;
- renderiza somente a página 1;
- gera uma miniatura WebP;
- envia a imagem para o R2;
- grava `cover_url` e `cover_r2_key`.

Isso resolve as capas em branco e torna a listagem do Jornal Online muito mais leve.

## Leitor

### Desktop

Manter o conceito atual de **folheador/revista**, porque ele funciona bem visualmente.

A implementação atual precisa ser otimizada: hoje ela renderiza todas as páginas para Data URL antes de liberar o folheador. A próxima versão deve carregar/renderizar apenas as páginas próximas da página atual.

### Mobile

Não usar Google Drive Preview nem iframe do navegador.

Usar um leitor próprio baseado em **PDF.js**, com:
- rolagem vertical contínua;
- página ajustada à largura;
- renderização virtual/lazy das páginas visíveis e vizinhas;
- pinça para zoom;
- indicador "página X de Y";
- botões discretos de página/zoom;
- opção de abrir/baixar o PDF original;
- retomada da página lida, se quisermos guardar localmente.

O PDF.js consegue trabalhar com requests parciais (Range), evitando baixar obrigatoriamente a edição inteira antes de mostrar a primeira página.

## R2 público e CORS

Para o PDF.js ler PDFs do domínio público do R2, o bucket/domínio deve permitir CORS para o site.

Configuração alvo:

- Origins: domínio final do Jornal IR e `https://jornalir.vercel.app` durante testes.
- Métodos: GET, HEAD, PUT (PUT apenas no endpoint S3 pré-assinado usado pelo painel).
- Headers de upload: Content-Type.
- Permitir leitura de headers úteis: Accept-Ranges, Content-Length, Content-Range, ETag.
- O domínio público do R2 é usado para GET; a URL pré-assinada de upload usa o endpoint S3 do R2.

## Banco de dados

`newspaper_editions` é a fonte de verdade do acervo. Campos preparados:

- `archive_provider`
- `pdf_r2_key`
- `pdf_file_name`
- `pdf_file_size`
- `pdf_sha256`
- `cover_r2_key`
- `pdf_url`
- `cover_url`
- `page_count`
- `archived_at`

O Google Drive e os PDFs estáticos atuais ficam apenas como legado/fallback enquanto o acervo antigo é migrado.

## Fluxo editorial futuro

Uma edição é enviada uma única vez. Depois:

`PDF no R2 -> Jornal Online -> extração -> candidatos -> revisão -> rascunhos de matérias`

A extração nunca publica automaticamente. O operador continua revisando, descartando publicidade, mesclando/dividindo candidatos e convertendo somente o que deve virar matéria.

## Migração do acervo antigo

Não precisa migrar tudo de uma vez.

1. Novas edições já entram pelo R2.
2. PDFs locais atuais e Drive continuam funcionando temporariamente.
3. Depois fazemos um importador em lote:
   - copia PDF antigo para R2;
   - calcula SHA-256;
   - gera capa;
   - cria/atualiza `newspaper_editions`;
   - valida arquivo e contagem de páginas.
4. Quando o acervo estiver validado, removemos o Drive do caminho público.

## Medidas comerciais confirmadas

Página impressa: **25 × 36 cm**

- Página inteira: **25 × 36 cm**
- Meia página: **25 × 18 cm**
- 1/4 de página: **12,5 × 18 cm**
- Padrão: **8,4 × 12 cm**
- Cartão de visita: **8,4 × 6 cm**

O formato Padrão e o 1/4 têm praticamente a mesma proporção; o Padrão é apenas menor.


## Decisão atualizada em 19/10/2026 — bucket exclusivo autorizado

O proprietário aprovou criar **um bucket R2 Standard exclusivo** para as edições digitais, na **mesma conta Cloudflare**, com o nome proposto `jornal-ir-edicoes`. Isso separa administração, credenciais, permissões e eventuais políticas dos PDFs em relação às mídias existentes; **não** cria uma franquia gratuita adicional (os 10 GB-mês gratuitos são por conta, não por bucket).

**Etapa de preparação, não publicação:** verificar a conta/buckets atuais e criar o bucket novo com Wrangler ou pelo painel, sem apagar ou mover objetos antigos, sem fazer os PDFs existentes públicos e sem importar nada enquanto o proprietário organiza os arquivos no Dropbox. Usar classe **Standard** (não Infrequent Access) para evitar taxas de recuperação dos PDFs acessados frequentemente.

- Confirmar no código a utilização real de `R2_EDITIONS_BUCKET` e `R2_EDITIONS_PUBLIC_BASE_URL`; a previsão documental por si só não garante que todas as rotas estejam conectadas.
- Credenciais de leitura/escrita do bucket devem ter escopo mínimo; preservar `R2_BUCKET`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` já usados pelo site. Nunca sobrescrever as credenciais existentes.
- Preparar futuramente um domínio público/caminho de download para `jornal-ir-edicoes` e regras CORS para PDF.js. O bucket é **privado ao criar**; não tornar público antes de validar o domínio e a política de acesso ao acervo.
- As edições continuam com registros de metadados no Supabase, arquivo PDF e miniatura da capa no R2, conforme a arquitetura aprovada; não criar upload através da Vercel para PDFs grandes.
- Validar integridade SHA-256, edição/ano, capa e duplicidade na importação futura; preservar cópia original no Dropbox até a conferência.
- **Não executar migração dos PDFs antes do aviso do proprietário.**

Status em 19/10: **decisão autorizada; criação física do bucket ainda depende de acesso autenticado à conta Cloudflare**, que não está conectada diretamente a este ChatGPT.


## Correção técnica de 19/10/2026 — credenciais isoladas por bucket

Inspeção do código real em `apps/sistema/src/providers/r2/editionArchive.r2.ts` mostrou que **não bastava configurar apenas `R2_EDITIONS_BUCKET`**: o cliente S3 e a geração de URLs de upload PUT ainda usavam `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, credenciais restritas ao bucket de fotos. Foi corrigido no commit `5e3697e` (sem deploy).

Configuração para o novo bucket de PDFs:
- `R2_EDITIONS_BUCKET=jornal-ir-edicoes`
- `R2_EDITIONS_ACCESS_KEY_ID`: **credencial R2 nova**, com acesso apenas ao bucket `jornal-ir-edicoes`, guardada como variável sensível, nunca no repositório.
- `R2_EDITIONS_SECRET_ACCESS_KEY`: segredo correspondente, sensível.
- `R2_EDITIONS_PUBLIC_BASE_URL`: **somente depois** de configurar e testar o domínio público próprio do bucket. Não usar `R2_PUBLIC_BASE_URL` do bucket de fotos para PDFs.

O mesmo módulo agora usa essas credenciais no cliente S3 **e na assinatura de URLs PUT**. Se `R2_EDITIONS_BUCKET` aponta para bucket diferente, exige as credenciais novas e a URL pública correta: não reutiliza silenciosamente a conta antiga. Se o bucket exclusivo não for configurado, mantém compatibilidade integral com o fluxo antigo de edições no bucket de mídias, sem interferir nas fotos. `isEditionR2ArchiveConfigured()` sinaliza falso enquanto faltar configuração obrigatória.

**Ordem segura:** (1) autenticar Cloudflare; (2) criar bucket privado; (3) criar token R2 S3 restrito a ele; (4) associar domínio público com CORS e validar; (5) configurar as quatro variáveis na Vercel; (6) testar sem alterar o acervo existente; (7) importar PDFs apenas quando o proprietário avisar. A criação do bucket não constitui publicação dos PDFs.

O ajuste de código foi auditado estaticamente. Typecheck/build e prova de upload separado ainda dependem da revisão/teste local pela Claude. Não colocar `R2_EDITIONS_BUCKET` na Vercel antes de configurar também as outras três variáveis.

## Atualização de 04/11/2026 — bucket em SEGUNDA CONTA Cloudflare

Decisão do proprietário: o bucket `jornal-ir-edicoes` passou a existir em uma **segunda conta Cloudflare**, separada da conta onde está o bucket de imagens/mídias do site — não mais apenas um bucket adicional na mesma conta como previsto em 19/10. Classe Standard, privado. Token R2 criado com acesso restrito a esse bucket.

Como o bucket agora vive em outra conta, o **endpoint S3 também é diferente**, e não bastava mais o conjunto de credenciais/bucket exclusivo já suportado: foi adicionada a variável `R2_EDITIONS_ENDPOINT`, usada pelo cliente S3 e pela assinatura de URLs PUT em `editionArchive.r2.ts`. Quando o bucket de edições é exclusivo (`R2_EDITIONS_BUCKET` diferente de `R2_BUCKET`), `R2_EDITIONS_ENDPOINT` passa a ser **obrigatória, sem fallback silencioso** para o `R2_ENDPOINT` da conta de imagens — o mesmo princípio já aplicado às credenciais e à URL pública. Sem bucket exclusivo configurado, o comportamento legado é preservado integralmente (reaproveita `R2_ENDPOINT` da conta de imagens).

Configuração completa esperada para o bucket exclusivo:
- `R2_EDITIONS_ENDPOINT` (conta nova)
- `R2_EDITIONS_BUCKET=jornal-ir-edicoes`
- `R2_EDITIONS_ACCESS_KEY_ID` (token restrito ao bucket, conta nova)
- `R2_EDITIONS_SECRET_ACCESS_KEY`
- `R2_EDITIONS_PUBLIC_BASE_URL` — continua vazia até configurar e testar o domínio público do bucket; não inventar URL nem forçar leitura pública enquanto faltar essa configuração.

Os PDFs originais continuam no computador do jornal (Informativo03) e serão enviados diretamente de lá para o R2 — não há PDFs no computador de desenvolvimento nem foram buscados aqui. `R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_PUBLIC_BASE_URL`/`R2_ENDPOINT` da conta de imagens permanecem intocados e seguem usados exclusivamente por `mediaStorage.r2.ts`.

## Atualização de 04/11/2026 — importador de metadados do acervo histórico (preparação, DRY-RUN)

O Informativo03 está enviando o acervo histórico de PDFs diretamente para o bucket `jornal-ir-edicoes`, padrão de chave `acervo/edicoes/IR NNN.pdf` (números observados entre 248 e 776, com lacunas). Esse envio é independente do fluxo de upload direto navegador→R2 descrito acima (`jornal-online/{ano}/edicao-{numero}/...`); os dois prefixos convivem no mesmo bucket sem conflito.

Para vincular os objetos já existentes no R2 aos registros de `newspaper_editions` **sem reenviar nada**, foi preparado:

- `apps/sistema/src/providers/r2/editionArchive.r2.ts`: nova função `listEditionArchiveObjects(prefix?)` — lista (somente leitura, com paginação) os objetos do bucket de edições, reaproveitando o mesmo cliente S3/credenciais/endpoint já usados pelo upload direto.
- `apps/sistema/src/providers/r2/editionsArchiveImportPlan.ts`: módulo **puro**, sem I/O, que reconhece o padrão `acervo/edicoes/IR NNN.pdf`, cruza os objetos do bucket com as edições já cadastradas e classifica cada objeto como `already_linked_matching`, `already_linked_diverging`, `ready_to_link`, `edition_not_found_pending_identification`, `duplicate_object` ou `unrecognized_key`; calcula lacunas (números ausentes dentro do intervalo observado); gera o relatório em CSV. Nunca inventa `publication_date` — edição sem registro correspondente fica marcada como pendente de identificação manual.
- `apps/sistema/scripts/import-editions-archive-dry-run.ts`: script **somente leitura** (`npx tsx scripts/import-editions-archive-dry-run.ts`, aceita `--prefix=` e `--out=`). Confere a configuração do R2 de edições e a `SUPABASE_SERVICE_ROLE_KEY` antes de prosseguir; lista o bucket; lê `newspaper_editions`; grava o CSV de conciliação. **Não existe nenhuma chamada de escrita no script** — nem `insert`/`update`/`upsert` no Supabase, nem `PutObject`/`DeleteObject` no R2; a vinculação real continuará usando `attachEditionR2Archive` (já existente), em uma etapa futura separada e explicitamente autorizada, após revisão humana do CSV.

Testes: `editions-archive-import-plan.test.ts` (reconhecimento de padrão, duplicatas, lacunas, não invenção de data, CSV) e `import-editions-archive-dry-run-script.test.ts` (confirma por análise estática do código-fonte que o script não grava nada). Ambos cobrem só a etapa de preparação; a importação real, a geração em lote de capas e a liberação pública (`R2_EDITIONS_PUBLIC_BASE_URL`) continuam pendentes de nova autorização.

## Atualização de 04/11/2026 — primeiro dry-run real executado (transferência concluída)

Transferência do Informativo03 para `jornal-ir-edicoes` **finalizada**: 497 PDFs, ~3,44 GiB. Dry-run real executado localmente (`npx tsx --env-file=.env.local scripts/import-editions-archive-dry-run.ts`, com `NODE_OPTIONS="--conditions=react-server"` — ver nota técnica abaixo) contra o bucket real e `newspaper_editions` real, somente leitura.

**Resultado:** 497/497 objetos listados e reconhecidos no padrão `acervo/edicoes/IR NNN.pdf` (0 não reconhecidos, 0 duplicados). Faixa observada 248–776, **32 lacunas** confirmadas (números ausentes no bucket). `newspaper_editions` segue com **0 registros** — por isso as 497 ficaram classificadas como `edition_not_found_pending_identification`: nenhuma data foi inventada, nenhum registro foi criado.

**Dois ajustes técnicos feitos nesta execução** (escopo mínimo, sem tocar no fluxo de upload existente):
1. `isEditionR2ArchiveConfigured()` exigia `R2_EDITIONS_PUBLIC_BASE_URL` mesmo para operações só de leitura (listar/HEAD) — inadequado enquanto o bucket segue privado por decisão (sem domínio ainda). Criada `isEditionR2ReadConfigured()` (endpoint+bucket+credenciais, sem URL pública) para uso do importador; `isEditionR2ArchiveConfigured()` (usada pelo upload real, que legitimamente precisa da URL pública) não foi alterada.
2. O script não lia `.env.local` automaticamente (isso é convenção do Next.js, não de um script standalone) — precisa ser invocado com `node --env-file=.env.local` (ou `npx tsx --env-file=.env.local ...`). E como `SUPABASE_SERVICE_ROLE_KEY` ainda não está configurada neste ambiente, o script caiu para a chave pública (anon) para o SELECT em `newspaper_editions` — o que só enxerga `active=true`; com a tabela vazia isso não mudou o resultado, mas **a chave de serviço precisa ser configurada antes de qualquer cruzamento real** para também enxergar edições inativas/rascunho.
3. **Nota técnica:** `editionArchive.r2.ts` importa `"server-only"`, que lança erro sob Node puro fora da condição `react-server` dos pacotes React Server Components — por isso a execução real do script exige `NODE_OPTIONS="--conditions=react-server"`.

**CSV completo** (497 linhas de objeto + 32 linhas de lacuna + cabeçalho) gerado na pasta de scratchpad da sessão (fora do repositório, não versionada): ver caminho no relatório da conversa. Integridade verificada por chave+tamanho (`ListObjectsV2`); SHA-256 completo não foi baixado dos 497 PDFs nesta etapa (custo/tempo de uma leva de ~3,44 GiB) — fica para a validação por lote, arquivo a arquivo, na importação real.

**Bloqueio real identificado para a vinculação:** `newspaper_editions.publication_date` é `not null` no schema. Não existe hoje nenhuma fonte confiável de data por edição histórica no repositório — será preciso uma planilha/fonte externa do jornal (não inventar por cadência semanal, pois as 32 lacunas quebram qualquer suposição automática de "toda quinta-feira").

## Atualização de 05/11/2026 — identificação automática de datas (amostra + lote completo) e preparação do gerador de capas

**Reconhecimento de data pelo próprio PDF, validado e aplicado às 497 edições:** investigação numa amostra de 12 edições (248–776) encontrou um dateline fixo impresso em toda edição, logo antes de "Edição NNN": `"São João do Sul, {dia da semana}-feira, DD de MÊS de AAAA"`. Reconhecimento extraído para módulo puro reutilizável `apps/sistema/src/providers/r2/editionDateRecognition.ts` (usado tanto pelo script de amostra `scripts/investigate-edition-dates-sample.ts` quanto pelo processamento completo `scripts/process-editions-archive-dates.ts`, sem duplicar lógica). O processamento completo (baixa concorrência, checkpoint retomável — comprovado: uma falha de rede transitória na edição 599 foi reprocessada isoladamente sem reprocessar as outras 496) resultou em **496/497 datas confirmadas automaticamente** (dateline de alta confiança + dia da semana confere com o calendário real + número da edição no texto confere com a chave R2) e **1 pendente de revisão humana (edição 340)**. Nenhuma data foi estimada por periodicidade semanal — confirmado o achado de que a cadência mudou de sexta-feira (edições mais antigas, 2016) para quinta-feira (a partir de ~2018), e que mesmo dentro desse período há exceções pontuais (ver edição 340 abaixo), então qualquer suposição de "toda quinta-feira" seria incorreta.

**Edição 340 — divergência registrada, não resolvida com certeza absoluta:** o PDF original imprime "quarta-feira" para 07/06/2018, mas 07/06/2018 é quinta-feira no calendário real. Edições vizinhas: 339 = 30/05/2018 (quarta-feira, confere com o calendário) e 341 = 14/06/2018 (quinta-feira, confere com o calendário). **Correção importante:** uma primeira análise afirmou erroneamente que os três intervalos eram de exatos 7 dias cada ("cadência semanal perfeita") — na verdade o intervalo 339→340 é de **8 dias** (irregular) e só o intervalo 340→341 é de 7 dias (normal). A hipótese mais provável continua sendo que 07/06/2018 é a data correta (dígitos extraídos pelo mesmo mecanismo confiável usado nas outras 496, e compatível com o padrão predominante de quintas-feiras a partir de 2018) e que só o nome do dia da semana foi impresso errado no PDF original — mas, sem a confirmação cruzada da sequência regular de 7 dias, isso **não está definitivamente comprovado**. Mantida como pendência explícita para decisão humana final antes de qualquer vinculação real; nenhuma data foi inventada ou ajustada automaticamente.

**Relatórios preservados localmente (fora do Git, pasta permanente no computador):** `docs/relatorios-locais/` foi adicionada ao `.gitignore` (nunca versionada). Contém os CSVs e checkpoints originais (497 edições, amostra de 12, dry-run de conciliação) e um CSV **consolidado** que distingue as 496 confirmações automáticas da edição 340 revisada manualmente, com a nota corrigida acima.

**Geração de capas — decisão de licenciamento e preparação (sem execução em lote):** `sharp` (já dependência) não decodifica PDF neste build; `pdfjs-dist` (já dependência) só rasteriza página em Node se o pacote nativo `canvas` (node-canvas/Cairo) estiver instalado, o que falhou nesta máquina Windows por falta de toolchain de build nativo. Testada a biblioteca `mupdf` (WASM puro, sem build nativo) — funcionou bem (mais rápida, menos memória), mas é **licenciada AGPL-3.0-or-later** (Artifex, exige licença comercial paga para uso em produto proprietário fechado) — **descartada por incompatibilidade de licenciamento com este projeto proprietário**, não instalada como dependência permanente. Em vez disso, validado que `pdfjs-dist` (Apache-2.0, já dependência) funciona com `@napi-rs/canvas` (MIT, binários pré-compilados, sem precisar de Cairo/GTK no Windows) — bastou substituir a `NodeCanvasFactory` padrão do pdfjs-dist (que faz `require("canvas")` incondicionalmente dentro de `page.render()`, mesmo recebendo um contexto de canvas externo) por uma fábrica equivalente usando `@napi-rs/canvas`. Comparação visual e de desempenho em 3 edições (248, 500, 776) confirmou qualidade idêntica à do teste com `mupdf` (tamanhos de arquivo WebP equivalentes, nitidez visualmente idêntica), só um pouco mais lenta e com mais uso de memória — aceitável dado que evita o problema de licença. `@napi-rs/canvas` foi adicionado como dependência real de `apps/sistema/package.json` (MIT, sem risco de licenciamento).

Preparado (não executado em lote): `apps/sistema/src/providers/r2/editionCoverRenderer.ts` (função pura `renderEditionCoverWebp` — recebe bytes já baixados, devolve WebP em memória, nunca grava no R2) e `apps/sistema/scripts/prepare-editions-archive-covers.ts` (orquestração com baixa concorrência e checkpoint retomável, mesmo padrão do processamento de datas; grava localmente em `docs/relatorios-locais/jornal-online-capas-preparadas/`, nunca no R2; por padrão só processa uma amostra pequena, `--limit=3`, com aviso explícito se alguém tentar rodar com o acervo inteiro). Testado localmente com 1 edição real (248) — gerada com sucesso, sem upload. A geração das 497 capas em lote e o envio ao R2 continuam pendentes de autorização explícita separada.

## Atualização de 05/11/2026 (continuação) — geração local das 497 capas e entrega pública pelo portal

**Geração local das 497 capas concluída:** `prepare-editions-archive-covers.ts` rodado para o acervo inteiro (concorrência 3, depois 1 para reprocessar 3 falhas isoladas). Corrigido um bug real encontrado na execução: 3 edições (470, 573, 574) falhavam com `DOMMatrix is not defined`/`Path2D is not defined` — certas páginas usam clipping/patterns que o pdfjs-dist invoca via `new DOMMatrix()`/`new Path2D()` fora da `canvasFactory` customizada. Corrigido adicionando esses dois globais (exportados pelo próprio `@napi-rs/canvas`, mesma licença MIT) em `editionCoverRenderer.ts`. Também corrigido o bug de profundidade do caminho relativo padrão do script (`DEFAULT_OUT_DIR`), já sinalizado anteriormente como pendência. Resultado final: **497/497 capas geradas e verificadas** (arquivo existe, não vazio, tamanho bate com o checkpoint), 58,52 MB totais, em `docs/relatorios-locais/jornal-online-capas-preparadas/` (`edicao-NNNN.webp` + `covers-checkpoint.json` + `covers-report.csv`). Amostras visuais conferidas em todo o intervalo cronológico (edições 248/2016, 340/2018, 373/2019, 500/2021, 776/2026) — todas nítidas e legíveis. Nenhum upload ao R2 nesta etapa.

**Entrega pública dos PDFs/capas pelo próprio portal (`apps/site`) — implementada e testada localmente, sem publicar:** o bucket `jornal-ir-edicoes` continua privado (sem `r2.dev`, sem domínio público, sem CORS novo) — decisão mantida. Em vez de expor o R2 diretamente, o portal ganhou duas rotas próprias de proxy somente leitura:

- `GET/HEAD /api/jornal-online/editions/[id]/pdf`
- `GET/HEAD /api/jornal-online/editions/[id]/cover`

A chave do objeto R2 nunca aparece na URL nem é aceita como parâmetro — a rota recebe só o `id` da edição (UUID do Supabase), consulta `newspaper_editions` com a chave publicável (anon, nunca `service_role`), confere `active = true` e `archive_provider = 'r2'`, e só então resolve `pdf_r2_key`/`cover_r2_key` no servidor. Suporta `Range`/`206 Partial Content`/`Content-Range`/`Accept-Ranges: bytes`/`ETag`, nome de download amigável (`IR-776.pdf`, via `?download=1` → `Content-Disposition: attachment`; sem o parâmetro, `inline`) e nunca baixa o arquivo inteiro para a memória da função (stream direto do R2 para a resposta, via `GetObjectCommand({ Range })` + `transformToWebStream()`). Erros: 404 para edição inexistente/inativa/sem provedor R2/sem chave (nunca vaza qual dessas causas, nem a chave do objeto); 416 com `Content-Range: bytes */total` para range inválido; 502 para falha do R2; 503 para Supabase indisponível ou credenciais R2 do portal ausentes.

Novo cliente R2 **somente leitura**, exclusivo do portal: `apps/site/src/lib/server/editionsR2.ts`, com suas próprias variáveis `R2_EDITIONS_ENDPOINT`/`R2_EDITIONS_BUCKET`/`R2_EDITIONS_ACCESS_KEY_ID`/`R2_EDITIONS_SECRET_ACCESS_KEY` (adicionadas a `apps/site/.env.example`) — **nunca reaproveita a credencial administrativa de escrita do `apps/sistema`**, que roda em outro projeto Vercel. A rota `editions/route.ts` passou a também selecionar `pdf_r2_key`/`cover_r2_key` e a usar `.or("pdf_url.not.is.null,pdf_r2_key.not.is.null")` no filtro, para que uma edição do acervo R2 sem `pdf_url` externo preenchido não suma da listagem; quando `archive_provider = 'r2'`, `pdfPath`/`coverUrl` passam a apontar para as rotas de proxy relativas (`/api/jornal-online/editions/{id}/pdf|cover`) — nunca o endereço técnico do R2 — o que também garante que a troca futura de domínio (`jornalir.vercel.app` → `informativoregional.net`) não exige nenhuma migração de arquivo: os links são relativos ao próprio portal. `FlipbookReader`/`MobilePdfReader` não precisaram de nenhuma alteração — já consomem `pdfUrl` como string opaca e o pdf.js já faz suas próprias requisições `Range` internamente.

**Testes:** 24 testes automatizados (`npx tsx --test test/*.test.ts` de dentro de `apps/site`, com `NODE_OPTIONS="--conditions=react-server"`) cobrindo GET sem Range (200), GET com Range (206 + `Content-Range`), HEAD (200 sem corpo, nunca chama o GET do R2), download com nome amigável, content-type de capa, id malformado (404 sem consultar Supabase/R2), edição inexistente/inativa/não-R2/sem chave (404), R2 não configurado e Supabase fora do ar (503), objeto ausente no R2 (404), range além do tamanho do arquivo (416), falha genérica do R2 (502), e confirmação de que nenhuma resposta de erro vaza a chave do R2 ou credenciais. Mais 5 testes da função pura que decide `pdfPath`/`coverUrl` por edição (não desaparecer da listagem, nunca expor endereço técnico do R2, edição legada preserva `pdf_url`/`cover_url` originais). `tsc --noEmit` e `next build` de `apps/site` passaram limpos, incluindo as duas rotas dinâmicas novas. Teste manual com o servidor de desenvolvimento local confirmou em HTTP real: 503 seguro quando as credenciais R2 do portal não estão configuradas (ainda não configuradas neste ambiente), e 404 imediato para um id malformado (tentativa de path traversal), sem consultar Supabase nem R2.

**Pendência identificada, não contornada:** um teste de ponta a ponta contra o R2 real (objeto `acervo/edicoes/IR 776.pdf`) foi tentado localmente reaproveitando temporariamente a credencial administrativa já configurada em `apps/sistema/.env.local`, só para a leitura — o classificador de permissões do ambiente bloqueou a ação por "exploração de credencial" antes de executar, o que está correto: a especificação pede explicitamente uma credencial de leitura separada, nunca a administrativa. Esse teste real contra o bucket privado continuou pendente de (a) um token R2 novo, restrito a leitura, exclusivo do bucket `jornal-ir-edicoes`, configurado em `apps/site/.env.local`/Vercel, e (b) pelo menos uma edição real vinculada em `newspaper_editions` para exercitar o caminho completo Supabase→R2→navegador.

## Atualização de 05/11/2026 (continuação) — conexão real ao R2 confirmada pelo portal

O proprietário configurou a credencial R2 nova (Object Read only, exclusiva do bucket `jornal-ir-edicoes`) em `apps/site/.env.local`. **Achado real no processo:** as 4 variáveis foram inicialmente coladas por engano em `apps/sistema/.env.local` (ficou duplicado ao lado da credencial administrativa existente) em vez de `apps/site/.env.local` — identificado por conferência de nomes de variável (sem exibir valores) e pela data de modificação de cada arquivo; reportado ao proprietário antes de qualquer teste, que corrigiu manualmente. Nenhuma credencial foi movida/copiada por mim entre arquivos.

Com a credencial no lugar certo, teste real (script local, descartado após o uso, sem gravação) confirmou, contra o bucket privado de verdade:
- `isEditionsR2PublicReadConfigured()` → `true`.
- `HEAD acervo/edicoes/IR 776.pdf` → 6.154.355 bytes, `application/pdf`, ETag presente.
- `GET` com `Range: bytes=0-1023` → `206`, `Content-Range: bytes 0-1023/6154355`, 1024 bytes recebidos, assinatura `%PDF-` confirmada nos primeiros bytes.
- `GET` com Range dos últimos 200 bytes → `206`, `Content-Range` correto.
- `GET` sem Range (arquivo completo, só para conferência — não salvo em disco) → `200`, tamanho bate exatamente com o HEAD.
- Range além do tamanho do arquivo → lança `EditionRangeNotSatisfiableError` com o tamanho real (mapeia para `416` na rota pública).
- Chave inexistente → lança `EditionObjectNotFoundError` (mapeia para `404` na rota pública).

Compatibilidade com as rotas públicas confirmada via servidor de desenvolvimento local real: com a credencial configurada, `GET/HEAD /api/jornal-online/editions/{id}/pdf|cover` passaram a responder `404 "Edição não encontrada ou indisponível"` (chegou a consultar o Supabase e não achou a edição) em vez do `503` anterior (R2 não configurado) — confirma que a rota distingue corretamente "R2 indisponível" de "edição ainda não cadastrada/vinculada", como pedido. `newspaper_editions` segue com 0 linhas; nenhum cadastro foi feito.

## Atualização de 05/11/2026 (continuação) — envio único de PDF pelo painel: reaproveitamento do acervo, conflito explícito e alerta de duplicata

Implementado localmente (sem upload real, sem gravação no Supabase, sem commit/push/deploy) o fluxo que o proprietário vai usar para testar manualmente a edição 776 pelo painel (Sistema → Editorial → Edições).

**1) Reaproveitamento de PDF já existente no acervo R2 (`acervo/edicoes/IR NNN.pdf`), sem reenviar:**
- `apps/sistema/src/providers/r2/editionArchiveRecognition.ts` (novo, função pura, sem I/O): `decideEditionArchiveAction` decide entre `no_current_archive` / `same_object_already_linked` / `same_content_different_key` / `conflict_requires_decision` — a identidade de conteúdo só é decidida por **SHA-256 completo**, nunca por ETag ou tamanho isolados. `findAcervoObjectForEdition` localiza o objeto do acervo correspondente ao número da edição numa listagem já obtida (reaproveita `parseEditionArchiveObjectKey` do importador de metadados existente).
- `editionArchive.r2.ts` ganhou `findAcervoEditionArchiveObject(editionNumber)` (lista só leitura), `sha256OfEditionArchiveObject(key)` (baixa e tira o hash — nunca confia em ETag) e `uploadEditionCoverBufferToR2` (mesma convenção de chave de `uploadEditionCoverToR2`, a partir de um buffer já renderizado, para reaproveitamento sem passar por `File`/upload do navegador).
- Duas Server Actions novas em `edicoes/actions.ts`: `recognizeEditionArchivedPdfAction(editionId)` — **somente leitura**, verifica se já existe PDF no acervo para esta edição e devolve a decisão, sem tocar em nada; `attachArchivedEditionPdfAction(editionId, candidateKey, confirmReplace)` — a única ação que grava (capa no R2 + metadados no Supabase via `attachEditionR2Archive`): baixa o PDF do acervo, confere o SHA-256, renderiza a capa da página 1 (`renderEditionCoverWebp`, já usado na geração das 497 capas) e só então vincula. Se já existe um PDF **diferente** vinculado à edição, recusa sem `confirmReplace: true` explícito — nunca substitui silenciosamente. O PDF original do acervo nunca é apagado por esta ação.
- UI em `EdicoesManager.tsx`: botão "Verificar acervo R2" (só leitura) por edição; quando encontra um candidato, mostra "Reaproveitar PDF do acervo" (ou "Substituir pelo PDF do acervo" + `window.confirm` quando há conflito).

**2) Conflito explícito no upload manual de um PDF diferente para uma edição já arquivada:** `prepareEditionR2UploadAction` agora usa a mesma decisão (`decideEditionArchiveAction`) antes de preparar as URLs de upload — se o hash do arquivo escolhido divergir do PDF já vinculado à edição, devolve `{ conflict: true, currentFileName }` em vez de seguir direto. `EdicoesManager.tsx` (`handlePdfSelected`) mostra um `window.confirm` nomeando o arquivo atual antes de reenviar com `confirmReplace: true`. Sem confirmação, nada é substituído.

**3) Alerta de possível duplicata contra matérias já existentes:** `apps/sistema/src/lib/editorial/articleDuplicateDetection.ts` (novo, função pura) compara o título sugerido de cada candidato extraído contra **todas** as matérias já cadastradas (`ArticleService.list()`, qualquer status — inclusive publicadas antes da edição impressa, sem filtro de data), por semelhança de palavras significativas do título (reaproveita `normalizeForSearch` de `fuzzySearch.ts`, já usado no projeto). `generateCandidates`/`generateCandidatesFromArchivedPdf` (`importar-pdf/actions.ts`) agora devolvem `possibleDuplicates: { candidateId, title, matches: [{ articleId, title, status, score }] }[]` (só candidatos com pontuação ≥ 50%, no máximo 5 correspondências cada, ordenadas da mais semelhante). `GenerateCandidatesForm.tsx` exibe a lista com link direto para a matéria existente. Nunca descarta, mescla, substitui ou despublica nada automaticamente — só sinaliza; a decisão final continua sempre do operador na revisão.

**Build:** `editionCoverRenderer.ts` (carrega `@napi-rs/canvas`, binário nativo por plataforma) passou a ser importado por uma Server Action pela primeira vez — isso quebrava `next build` (webpack tentando parsear o `.node` como módulo JS). Corrigido adicionando `@napi-rs/canvas` a `serverComponentsExternalPackages` em `next.config.mjs`, ao lado do `pdfjs-dist` já externalizado pelo mesmo motivo.

**Testado (mocks/funções puras, sem rede real):** 17 testes novos (`node:test`) — `edition-archive-recognition.test.ts` (12 casos: sem arquivo vinculado, já vinculado ao mesmo objeto, mesmo conteúdo em chave diferente, conteúdo diferente exige decisão, hash ainda não calculado nunca presume igualdade, localização do objeto do acervo por número de edição) e `article-duplicate-detection.test.ts` (5 casos: título idêntico pontua alto, matéria publicada antes da edição impressa entra na comparação, títulos sem relação não geram alerta, título vazio nunca compara, nunca mais de 5 correspondências). Suíte completa de `apps/sistema` (265 testes) passou, incluindo os 17 novos. `tsc --noEmit` limpo. `next build` completo (produção) passou depois da correção do `next.config.mjs`.

**Não executado nesta etapa (como pedido):** nenhum upload real ao R2, nenhuma gravação real no Supabase, nenhum cadastro automático da edição 776, nenhuma extração de matérias real, nenhum commit/push/deploy/migration. O teste real do fluxo completo (clicar em "Verificar acervo R2" na edição 776 pelo navegador, confirmar o reaproveitamento, gerar candidatos e revisar) depende de autorização explícita para a próxima etapa.

## Atualização de 05/11/2026 (continuação) — extração automática pós-arquivamento, comparação por conteúdo e viabilidade real no Vercel

**1) Extração automática, sem comando extra do operador:** `finalizeEditionR2UploadAction` (PDF novo) e `attachArchivedEditionPdfAction` (reaproveitamento do acervo) agora chamam `runAutomaticExtraction(editionId)` imediatamente depois de confirmar o arquivamento — reaproveitando `generateCandidatesFromArchivedPdf` já existente, nunca duplicando lógica de extração. **Nunca aplicado à importação histórica em lote** (os scripts `prepare-editions-archive-covers.ts`/`import-editions-archive-dry-run.ts` não chamam essas duas ações — só os scripts isolados tocam as 497 edições).

**2) Falha na extração nunca desfaz o arquivamento; retry nunca duplica:** `runAutomaticExtraction` nunca propaga exceção — qualquer erro (PDF corrompido, parser, timeout) é capturado e devolvido como `{ status: "failed", error }` dentro do resultado da própria ação de arquivamento, que já tinha confirmado o PDF/capa ANTES dessa chamada (gravação já comprometida, estrutuada como dois passos sequenciais independentes). Novo lote nunca duplica: a extração automática usa o mesmo `findBatchByHash`/`force` que a extração manual já usava — reenviar o mesmo PDF ou clicar "Gerar candidatos" de novo em Importar PDF detecta o lote anterior e pede confirmação explícita (`force`) antes de gerar outro. Todo candidato continua nascendo `pending`; nenhuma matéria é publicada automaticamente (`ImportCandidateService.convertToDraft` continua a única porta para virar rascunho, nunca publicado).

**3) Comparação de duplicata agora inclui conteúdo, não só título:** `articleDuplicateDetection.ts` reescrito — `findPossibleDuplicateArticles(title, body, articles)` calcula separadamente sobreposição de palavras do título (limiar 50%) e do corpo (HTML sem tags, lista de stopwords comuns do português, limiar 30%), reporta `reason: "title" | "content" | "title_and_content"` e a maior pontuação das duas. Continua determinístico, sem IA/API paga — só sobreposição de conjuntos de palavras normalizadas (reaproveita `normalizeForSearch` já existente). `buildDuplicateWarnings` (`importar-pdf/actions.ts`) agora passa `candidate.suggestedBody` e `article.body` de cada matéria.

**4) Alertas no resumo de candidatos, antes da revisão:** o resultado da extração automática (incluindo `possibleDuplicates` com link direto para a matéria existente) volta já na resposta da própria ação de arquivamento e é exibido imediatamente em `EdicoesManager.tsx` (painel inline por edição, com link "revisar agora"/"Tentar novamente" para `/sistema/editorial/importar-pdf?edicao={id}`) — o operador vê o alerta sem precisar navegar manualmente antes de decidir revisar. `GenerateCandidatesForm.tsx` (fluxo manual/retry) também mostra o motivo (`título`/`conteúdo`/`título e conteúdo`) de cada correspondência. Nunca descarta, mescla ou substitui nada automaticamente — a decisão continua sempre do operador.

**5) Viabilidade real no Vercel (tempo/memória/tamanho) — medido, não só estimado:** rodei a extração de verdade (leitura real do R2, sem gravar nada) contra `acervo/edicoes/IR 776.pdf`: download 6.154.355 bytes em 519ms, extração de texto (24 páginas, 123 grupos de candidatos) em 2.128ms — **total 2,6s**. `extractPdf` usa só a camada de texto do PDF (sem renderizar páginas como imagem — isso só acontece na geração de capa, função separada), então o custo escala com número de páginas, não com o tamanho em bytes do arquivo; uma edição de 100+ páginas ainda deve ficar na faixa de segundos, bem distante do limite padrão de função do Vercel. Ainda assim, como o limite padrão sem configuração pode ser bem menor que isso em alguns planos, adicionei `export const maxDuration = 60` em `edicoes/page.tsx` e `importar-pdf/page.tsx` (cobre Hobby e Pro sem exigir configuração adicional; Pro aceita até 300s/800s se uma edição real algum dia precisar de mais). Nenhuma fila/job em background foi construída (não existia infraestrutura disponível no projeto para isso e não foi necessária dado o tempo real medido) — a extração continua síncrona dentro da própria ação, mas desenhada para que uma falha (incluindo um timeout hipotético) nunca derrube o arquivamento já confirmado, e o botão manual "Gerar candidatos" em Importar PDF sempre serve como caminho de recuperação, protegido contra duplicação pelo mesmo dedup por hash.

**6) Build:** o teste de tempo real (item 5) usou um script temporário (`_tmp-extraction-timing-test.ts`, escrito e removido nesta etapa, nunca comitado) chamando só funções já existentes (`getEditionPdfFromR2` + `extractPdf`) — nenhuma mudança de produção decorrente desse teste. `tsc --noEmit` e `next build` (produção, com `IR_LOCAL_ONEDRIVE_BUILD=1` por causa do ambiente OneDrive local, já documentado anteriormente) passaram limpos depois de todas as mudanças desta etapa.

**Testado:** suíte completa de `apps/sistema` com 268 testes (3 reescritos/ampliados em `article-duplicate-detection.test.ts` para o novo parâmetro de corpo + `reason`, todos os demais intactos) — todos passando. Teste real e ponta a ponta de leitura (download + extração, sem gravar nada) contra a edição 776 real no R2, descrito no item 5.

**Fluxo completo testado para os dois casos pedidos (requisito 6):**
- PDF **já arquivado** (caso 776): `attachArchivedEditionPdfAction` → extração automática → candidatos + alerta de duplicata, tudo com mocks em teste automatizado; a leitura real do PDF de 776 foi validada à parte (item 5).
- PDF **novo**: `finalizeEditionR2UploadAction` → mesma extração automática encadeada, mesma estrutura de resultado. Não testado com um PDF novo real nesta etapa (exigiria upload real, fora do autorizado); a lógica é idêntica à do caminho do acervo, já validada com mocks.

**Pronto para o proprietário testar a edição 776 pelo painel?** Sim, com uma ressalva: o fluxo de código está completo, testado (mocks + leitura real) e builda limpo. A única coisa que falta é a ação real em si — ainda não autorizada nesta etapa. Telas/ações para o teste real:
1. **Sistema → Editorial → Edições** → localizar/criar a edição 776 → clicar **"Verificar acervo R2"** → clicar **"Reaproveitar PDF do acervo"** (isso grava de verdade: capa no R2 + metadados no Supabase, e dispara a extração automática na sequência — tudo em uma única ação do operador).
2. O resumo de candidatos e eventuais alertas de duplicata aparecem ali mesmo, com um link **"revisar agora"**.
3. Clicar nesse link leva a **Sistema → Editorial → Importar PDF** (já com a edição 776 selecionada), onde a lista de candidatos pode ser revisada, convertida em rascunho ou descartada — nunca publicada automaticamente.

**Próximo passo seguro para testar a edição 776 pelo navegador:** cadastrar (ou vincular, via `attachEditionR2Archive` em `apps/sistema`) **uma única linha real** em `newspaper_editions` para a edição 776, apontando `pdf_r2_key = "acervo/edicoes/IR 776.pdf"`, `archive_provider = "r2"`, `active = true`, e uma `publication_date` válida (776 não está entre as pendências de data — só a edição 340 ficou em revisão). Isso é uma gravação real no Supabase de produção e não foi feita nesta etapa por estar fora do que foi autorizado agora.

## Atualização de 05/11/2026 (continuação) — ERRO REAL EM PRODUÇÃO corrigido: `require.resolve()` do pdfjs-dist sob webpack devolvia um ID numérico, não um caminho

**Achado real, com o proprietário já testando pelo painel publicado**: ao clicar "Reaproveitar PDF do acervo" de verdade (POST para `/sistema/editorial/edicoes`, deployment `dpl_FnmXShfmo9UGF2jgydm5MX7GKFFK`), a Server Action quebrou antes de renderizar qualquer capa. Log real da Vercel:
```
TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received type number (43899)
    at dirname (node:path:1439:5)
    at 34270 (/var/task/apps/sistema/.next/server/chunks/4270.js:1:1796)
digest: '2211172284'
```

**Causa confirmada** em `apps/sistema/src/providers/r2/editionCoverRenderer.ts`: `const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));`. Fora de um bundler, `require.resolve()` devolve o caminho real do arquivo no disco — mas dentro de um bundle webpack (como o das Server Actions do Next.js, inclusive na Vercel), o webpack intercepta estaticamente toda chamada `require.resolve("string literal")` e a substitui pelo **ID numérico do módulo dentro do bundle**, nunca um caminho. `dirname()` sobre esse número quebra com `ERR_INVALID_ARG_TYPE`. Confirmado com precisão: o módulo que quebrou tem o ID `34270`, dentro do chunk `4270.js` — exatamente os números do stack trace real, localizados de propósito numa reprodução equivalente (build local idêntico, chunk e ID conferidos byte a byte antes de aplicar a correção).

**Correção** (só a linha necessária, nada mais): troca `require.resolve(...)` direto por `__non_webpack_require__.resolve(...)` quando disponível — é a forma documentada do próprio webpack de pedir a resolução REAL do Node, sem a reescrita estática —, com fallback para o `require` normal fora de um bundle (scripts via `tsx`, testes), onde `__non_webpack_require__` não existe e o `require.resolve()` comum já é o real do Node. `require("pdfjs-dist/legacy/build/pdf.js")` (linha anterior, um `require()` comum, não `.resolve()`) nunca foi afetado — confirmado pelo próprio stack trace, que só quebra na linha do `dirname`.

**Carregamento do worker do pdfjs-dist (`GlobalWorkerOptions.workerSrc = new URL(...)`, em `EdicoesManager.tsx`) — conferido e descartado como causa**: é um erro DIFERENTE, já investigado antes (ver seção anterior) e confirmado restrito ao modo `next dev` local (aparece só dentro de componentes exclusivos de desenvolvimento, `ReactDevOverlay`/`HotReload`, que não existem em produção) — os logs reais de produção para esta rota nunca mostraram esse erro, só o do `require.resolve()` acima. Os dois não têm relação; nenhuma mudança foi feita nessa linha.

**Teste de regressão novo** (`apps/sistema/test/edition-cover-renderer-init.test.ts`, 2 casos): (1) checagem estática que impede a reintrodução do padrão vulnerável (`dirname(require.resolve(` nunca mais aparece no arquivo) e confirma a presença do padrão corrigido — **verificado que esse teste falha de verdade contra o código original** (reproduzido localmente: revertida a correção, o teste 1 falha; restaurada, passa); (2) chamada real a `renderEditionCoverWebp()` com um PDF mínimo válido construído no próprio teste (sem mock), forçando a avaliação completa do topo do módulo (inclusive a linha corrigida) e exercitando pdfjs-dist + @napi-rs/canvas + sharp de ponta a ponta — devolve um WebP real (assinatura RIFF/WEBP confirmada). Suíte completa: **264/264 testes passam**, `tsc --noEmit` limpo, `next build` limpo.

**Risco relacionado considerado e descartado**: as pastas `standard_fonts`/`cmaps` do pdfjs-dist (usadas por `standardFontDataUrl`/`cMapUrl`, computadas a partir do mesmo `pdfjsRoot`) precisam existir no sistema de arquivos da função serverless da Vercel. Como `pdfjs-dist` já está em `serverComponentsExternalPackages` (`next.config.mjs`, decisão anterior), o Next.js já rastreia e inclui a pasta completa do pacote externo no bundle da função — por isso nenhuma configuração adicional de `outputFileTracingIncludes` foi acrescentada (seria redundante e fora do que é necessário corrigir agora).

ARQUIVOS: `apps/sistema/src/providers/r2/editionCoverRenderer.ts` (corrigido), `apps/sistema/test/edition-cover-renderer-init.test.ts` (novo).
