# Limpeza de duplicata confirmada — pós-carga 2023-2024 (Fase 45C)

Autorizada por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `008f016`): 1 grupo confirmado (`CASOS DE DENGUE AUMENTAM 900% EM SC`, external_ids 572497/572509, corpo idêntico). Mesma regra determinística das limpezas anteriores (Fase 43/44F). **Nenhum DELETE** — só arquivamento reversível.

## Regra determinística de canônico (idêntica às limpezas anteriores)

1. tem capa > sem capa;
2. editoria específica > `geral`;
3. `published_at` mais recente;
4. empate exato: maior `external_id` numérico.

## Dry-run

`node --env-file=".env.local" duplicate-cleanup-2023-2024.mjs` confirmou exatamente os números autorizados antes de qualquer escrita:

| Métrica | Esperado | Encontrado |
|---|---|---|
| Grupos confirmados | 1 | 1 |
| Artigos envolvidos | 2 | 2 |
| Artigos a arquivar | 1 | 1 |
| Canônicos mantidos `published` | 1 | 1 |

O script também validou que o grupo proibido (569333/569372, "precisa inspeção manual") não entrou no plano.

## Plano aplicado (`--commit`)

| Título | Mantido (published) | Arquivado |
|---|---|---|
| CASOS DE DENGUE AUMENTAM 900% EM SC | `572509` (editoria `saude`, com capa, publicado 19:40) | `572497` (editoria `geral`, com capa, publicado 19:17) |

Critério decisivo: ambos tinham capa e mesma data; `572509` venceu por estar na editoria específica `saude` (regra 2, antes mesmo de chegar ao desempate por data/external_id).

O artigo arquivado recebeu `status='archived'` e `archived_at=now()`. Nenhum outro campo foi alterado.

## Validação pós-limpeza (somente leitura)

| Checagem | Resultado |
|---|---|
| Grupo com exatamente 1 published + 1 archived | ✅ |
| Artigo arquivado com `archived_at` preenchido | ✅ |
| Grupo proibido (569333/569372) continua 100% published | ✅ intocado |
| Total físico de `articles` (nada deletado) | 17.980 (inalterado) |
| Total `article_external_sources` | 17.980 (inalterado) |
| Total `article_media` | 28.254 (inalterado) |
| Total `published` (origin=legacy_site) | 17.905 = 17.980 − 61 (Fase 43) − 13 (Fase 44F) − 1 (esta limpeza) ✅ |

## O que NÃO foi tocado

- O grupo `SANCIONADA LEI QUE CRIMINALIZA BULLYING...` (569333/569372) — continua pendente de inspeção manual.
- Os 13 candidatos antigos ainda pendentes (10 de 2015-2020 + 3 de 2021-2022).
- `media_assets`, `article_media`, `article_external_sources` do artigo arquivado — nenhuma linha alterada ou removida.
- Nenhum `DELETE` em nenhuma tabela.

## Ferramenta criada

- `scripts/legacy-audit/duplicate-cleanup-2023-2024.mjs` — dry-run por padrão, `--commit` aplica.
