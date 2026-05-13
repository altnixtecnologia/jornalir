# Estrutura Futura — Banco de Matérias e Categorias

## Objetivo
Garantir cadastro e armazenamento seguro de todas as matérias, com:
- categorias por aba do menu,
- publicação imediata ou programada,
- mapeamento de destaque por área.

## Categorias do Menu (abas)
- `geral`
- `saude`
- `esportes`
- `policia`
- `politica`
- `colunistas`
- `sociais`
- `jornal-online`
- `noticias` (categoria editorial adicional)

## Modelo Sugerido

### Tabela `news_items`
- `id` (uuid, pk)
- `slug` (text, unique)
- `titulo` (text)
- `resumo` (text)
- `conteudo` (text)
- `categoria_menu` (text)  
  Um dos slugs de categoria
- `autor` (text)
- `tempo_leitura_min` (int)
- `image_path` (text)  
  Caminho no storage
- `image_url_publica` (text)
- `modo_publicacao` (text check in `('agora','programada')`)
- `publicar_em` (timestamp, null)
- `publicada_em` (timestamp)
- `status` (text check in `('rascunho','agendada','publicada','arquivada')`)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Tabela `news_featured_map`
- `id` (uuid, pk)
- `news_id` (uuid, fk -> `news_items.id`)
- `featured_zone` (text)  
  `hero-principal`, `hero-secundario`, `topo-categoria`, `nenhum`
- `ativo` (boolean)
- `ordem` (int, null)
- `inicio` (timestamp, null)
- `fim` (timestamp, null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Regras
- Toda matéria cadastrada fica persistida, mesmo sem destaque.
- Destaque é uma camada separada (`news_featured_map`).
- Matéria programada só entra no site após `publicar_em`.
- Filtros por categoria, data e texto usam índice.

## Índices Recomendados
- `news_items(slug)`
- `news_items(categoria_menu, publicada_em desc)`
- `news_items(status, publicar_em)`
- `news_featured_map(featured_zone, ativo, inicio, fim)`

## Storage de Imagens
- Bucket sugerido: `materias`
- Estratégia:
  - upload original
  - versão otimizada web (meta ~40KB para thumbnail/lista)
  - `news_items.image_url_publica` aponta para versão otimizada

## Endpoints Futuros
- `POST /api/materias`
- `PATCH /api/materias/:id`
- `GET /api/materias?categoria=&q=&data=`
- `POST /api/materias/:id/feature`
- `PATCH /api/materias/:id/publicacao`

## Compatibilidade com a Fase Atual
- Atualmente a fase local usa IndexedDB e compressão client-side.
- Na migração para banco, reaproveitar:
  - categorias,
  - `publishMode`/`scheduledFor`,
  - `featuredZone`.
