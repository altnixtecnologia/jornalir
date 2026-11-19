# Jornal Online — conferência dos metadados históricos (18/11/2026)

## Situação lida no banco oficial, sem alterações

Em 18/11/2026:
- 499 fichas cadastradas, 498 com PDF e capa vinculados ao R2
- 497 fichas sem `page_count`, 496 sem `pdf_sha256`
- Edição 778 cadastrada para 19/11, ainda sem PDF, em preparação: **não é um erro** e não faz parte desta rotina
- O acervo histórico já foi importado. Não reenviar PDFs nem refazer a migração.

## Código existente reaproveitado

`getEditionPdfFromR2()` para leitura dos bytes do R2; `loadPdfDocument()` para descobrir o número real de páginas; `newspaper_editions` para registrar os dados, sem tabelas auxiliares.

Script: `apps/sistema/scripts/backfill-editions-archive-metadata.ts`.

## Executar em ambiente local autorizado, nunca no navegador

A partir da pasta `apps/sistema`, após sincronizar o repositório e conferir `.env.local`:

Prévia (só download/leitura, três edições por execução, sem alterações no banco ou R2):

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/backfill-editions-archive-metadata.ts --limit=3
```

O checkpoint e relatório são locais, em `docs/relatorios-locais/jornal-online-metadados/` (não versionar nem enviar segredos). A prévia retoma entre execuções e avança até os PDFs seguintes.

Somente depois da conferência da prévia e aprovação do operador, preenchimento condicional dos campos nulos:

```bash
NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env.local scripts/backfill-editions-archive-metadata.ts --apply --limit=3
```

Requer `SUPABASE_SERVICE_ROLE_KEY` local e política de credencial administrativa permitida. **Nunca colar chave no chat nem no GitHub.** Para mais edições, executar lotes de no máximo 25 com `--limit=N`; concorrência máxima 2, padrão 1.

## Proteções

- Sem alteração de `active`, `online_status`, `available_at`, `publication_date`, `pdf_r2_key`, `cover_r2_key`, `pdf_url`, `pdf_file_size` ou qualquer arquivo no R2
- Nunca calcular SHA-256 a partir do ETag nem inferir páginas de tamanho, ano ou número da edição
- Verificar tamanho, hash e páginas existentes; divergência bloqueia a edição e exige revisão
- Atualizar **somente colunas nulas** `pdf_sha256`/`page_count`
- Filtro de concorrência otimista no UPDATE: `id`, edição, provedor, chave R2, tamanho e nulidade/valor anterior de ambos os campos
- Releitura do PDF ao aplicar, sem confiar cegamente no checkpoint de prévia
- Nenhuma API pública, tabela nova, credencial no navegador, migração de banco, domínio ou deploy necessário

## Critérios de encerramento

1. Rodar prévia em três edições com chave R2 existente, conferir contagem de páginas e hash em PDF real
2. Se aprovado, aplicar amostra de três, reconsultar banco para validar persistência e ausência de mudanças indevidas
3. Continuar em lotes pequenos com retomada; casos com divergência vão para revisão, sem regravar
4. Homologar abertura do PDF e da capa no Jornal Online antes e depois do preenchimento
5. Marcar etapa concluída só quando o inventário do banco comprovar todos os registros históricos válidos preenchidos ou pendências explicadas

**Estado atual:** implementação e testes em desenvolvimento; os metadados **não foram ainda preenchidos** no banco de produção.


## Diretriz de 18/11/2026 (nova decisão)

**Não regularizar o acervo inteiro neste momento.** Restringir os preenchimentos históricos aos PDFs de edições de **2025 e 2026**, com filtro obrigatório no próprio SELECT do script (`publication_date >= 2025-01-01` e `publication_date < 2027-01-01`). Edições de 2024 e anteriores ficam intactas.

Levantamento read-only desta etapa: 50 edições R2 de 2025 (50 incompletas); 45 edições R2 de 2026 (41 incompletas, 4 já completas). Total: 91 pendentes. A edição 778 é um teste em preparação, previsto para 19/11; sem PDF e fora do processamento.

**PDFs novos:** `EdicoesManager.analyzePdf()` já calcula SHA-256 via `crypto.subtle.digest` e páginas via `pdfjs-dist` quando o usuário seleciona o arquivo, antes do upload. `finalizeEditionR2UploadAction` valida e `attachEditionR2Archive` persiste esses dois campos na mesma ficha. **Não duplicar este fluxo**. Há teste de regressão para garantir que continue assim.

**Metadados históricos:** continuam sendo preenchidos apenas quando calculados a partir dos bytes reais, em lotes pequenos e preservando todos os valores existentes; nunca reenviar o PDF, nunca alterar publicações e não executar operações massivas sem validação.
