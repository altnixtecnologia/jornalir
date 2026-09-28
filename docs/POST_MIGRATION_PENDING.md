# Pendências pós-migração — Informativo Regional

Atualizado após a Fase 47. Este arquivo separa o que já está concluído do que ficou deliberadamente para depois.

## Concluído

- Migração histórica 2015–2026 encerrada: 23.292 registros físicos de matérias e 44.289 mídias.
- 75 cópias duplicadas já confirmadas foram arquivadas de forma reversível (61 + 13 + 1), nunca deletadas.
- Portanto, o acervo legado esperado na camada pública é de **23.217 matérias publicadas** (23.292 - 75), antes de somar eventuais matérias novas criadas no painel.
- O portal já possui listagem paginada real em `/noticias`, editorias e busca, usando `public_articles` e ordenação por `published_at DESC, id DESC`.
- Agendamento automático de matérias existe no banco via `pg_cron` (`publish_due_scheduled_articles`, a cada minuto).
- Painel editorial passou por typecheck/build e revisão pós-migração na Fase 47.

## Fazer agora — antes/depois do staging do painel

1. **Liberar acesso visível ao acervo completo no site**
   - validar no ambiente online que `/noticias` pagina todo o acervo público;
   - conferir total real retornado pelo site;
   - validar página 1, uma página intermediária e a última página;
   - validar editorias e busca contra o acervo completo;
   - garantir um acesso permanente e visível a `/noticias` no header/menu, independente de existir placement em "Últimas notícias";
   - não transformar matérias históricas em destaque automaticamente só para preencher a home.

2. **Staging/preview do painel**
   - publicar `apps/sistema` isolado do projeto Vercel atual do `apps/site`;
   - validar login, sessão, matérias, imagens, publicação, programação, destaques, edições/PDF e responsividade;
   - só depois decidir subdomínio/produção definitiva.

3. **Google Drive do Jornal Online**
   - concluir configuração OAuth/credenciais server-side do painel;
   - testar upload real de um PDF de edição e confirmar que o arquivo fica acessível no Jornal Online;
   - não armazenar novos PDFs de edições no Supabase Storage.

## Pendências editoriais do legado — não resolver automaticamente

- **19 grupos candidatos a duplicata ainda pendentes**:
  - 14 antigos;
  - 5 envolvendo 2025–2026 (3 com corpo idêntico e 2 que exigem inspeção).
- **50 itens `needs_review`** ficaram fora da carga automática ao longo dos 6 lotes:
  - 2015–2016: 13;
  - 2017–2018: 8;
  - 2019–2020: 12;
  - 2021–2022: 13;
  - 2023–2024: 2;
  - 2025–2026: 2.
- **30 itens em quarentena/classificados** ficaram fora:
  - 2023–2024: 3;
  - 2025–2026: 27.
- **7 exceções globais de data** continuam fora da carga automática.
- Revisar esses grupos/casos manualmente em etapa editorial futura; não liberar, reclassificar, arquivar ou importar em massa sem nova conferência.

## Pendências de produto/operacionais para depois do uso real

- Confirmar em uso real se os filtros locais de foto/destaque na listagem de matérias devem virar filtros globais server-side.
- Validar o fluxo de notificações: o modelo/campo de notificação existe, mas entrega push real ainda precisa de verificação/implementação específica.
- Revisar experiência e desempenho do painel com uso diário da redação; ajustar UX por feedback real antes de produção definitiva.
- Definir subdomínio final do painel e política de acesso depois que o staging estiver aprovado.
- Fazer limpeza operacional de eventual PDF órfão/privado no Drive apenas se ocorrer falha entre upload e criação da permissão pública.

## Regra

Não rodar novamente a migração histórica 2015–2026. Qualquer trabalho daqui em diante deve ser de portal, painel, revisão editorial manual ou operação.
