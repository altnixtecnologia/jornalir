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
