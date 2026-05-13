# Estrutura Futura — Banco de Dados para Anuncios

## Objetivo
Migrar do modelo atual por pastas em `public/uploads/anuncios/*` para persistencia em banco + storage, sem quebrar o front-end.

## Estado Atual (Fase Mock)
- Imagens lidas de:
  - `public/uploads/anuncios/grande1..grande4`
  - `public/uploads/anuncios/pequena1..pequena3`
- Rotacao por quadro no front-end.
- Tempo de exibicao por quadro no front-end.

## Estrutura Sugerida no Banco

### Tabela `ad_slots`
- `id` (uuid, pk)
- `codigo` (text, unique)  
  Ex.: `grande1`, `grande2`, `pequena1`
- `nome` (text)  
  Ex.: `Grande 1`
- `tipo` (text check in `('grande','pequena')`)
- `ordem` (int)  
  Ordenacao visual dos quadros
- `duracao_segundos` (int)  
  Tempo de troca do quadro
- `ativo` (boolean default true)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Tabela `ad_images`
- `id` (uuid, pk)
- `slot_id` (uuid, fk -> `ad_slots.id`)
- `titulo` (text, null)
- `arquivo_path` (text)  
  Caminho no storage
- `arquivo_url_publica` (text)  
  URL final para exibir no site
- `ordem` (int)  
  Ordem de rotacao dentro do quadro
- `ativo` (boolean default true)
- `inicio_exibicao` (timestamp, null)
- `fim_exibicao` (timestamp, null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Storage (Supabase ou similar)
- Bucket sugerido: `anuncios`
- Pastas:
  - `anuncios/grande1/`
  - `anuncios/grande2/`
  - `anuncios/grande3/`
  - `anuncios/grande4/`
  - `anuncios/pequena1/`
  - `anuncios/pequena2/`
  - `anuncios/pequena3/`

## Fluxo de Migracao (Sem Reescrever UI)
1. Criar tabelas `ad_slots` e `ad_images`.
2. Criar bucket e politicas de acesso.
3. Importar imagens atuais das pastas locais para o bucket.
4. Popular `ad_slots` com os 7 quadros iniciais.
5. Popular `ad_images` com a ordem atual.
6. Trocar a camada de leitura:
   - hoje: `siteSettings.ts`
   - depois: endpoint/API que retorna `slots + imagens`.
7. Manter os componentes de tela (`PaidAdsColumn`, `PaidAdsStrip`) sem mudanca estrutural.

## Regras Importantes
- Cada quadro controla seu proprio `duracao_segundos`.
- Cada imagem tem ordem independente dentro do quadro.
- Suporte a ativar/inativar quadro e imagem.
- Dimensoes recomendadas:
  - `grande`: proporcao `4:5`
  - `pequena`: proporcao `16:9`

## Endpoint Futuro (Exemplo)
- `GET /api/anuncios/slots`
  - Retorna quadros ativos com imagens ordenadas.
- `POST /api/anuncios/slots/:id/imagens`
  - Upload e cadastro da imagem no quadro.
- `PATCH /api/anuncios/slots/:id`
  - Atualiza `duracao_segundos`, `ativo`, `ordem`.
- `PATCH /api/anuncios/imagens/:id`
  - Atualiza ordem/periodo/ativo.

## Compatibilidade com o que ja existe
- Manter os IDs logicos:
  - `grande1..grande4`
  - `pequena1..pequena3`
- Isso facilita migracao sem impacto visual no portal.
