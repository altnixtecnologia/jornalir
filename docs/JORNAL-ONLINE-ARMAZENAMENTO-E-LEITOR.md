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
