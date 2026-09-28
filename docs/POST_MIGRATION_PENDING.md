# Pendências pós-migração — Informativo Regional

Atualizado após a Fase 48. Este arquivo separa o que já está concluído do que ficou deliberadamente para depois.

## Concluído

- Migração histórica 2015–2026 encerrada: 23.292 registros físicos de matérias e 44.289 mídias.
- 75 cópias duplicadas já confirmadas foram arquivadas de forma reversível (61 + 13 + 1), nunca deletadas.
- Portanto, o acervo legado esperado na camada pública é de **23.217 matérias publicadas** (23.292 - 75), antes de somar eventuais matérias novas criadas no painel.
- O portal já possui listagem paginada real em `/noticias`, editorias e busca, usando `public_articles` e ordenação por `published_at DESC, id DESC`.
- Agendamento automático de matérias existe no banco via `pg_cron` (`publish_due_scheduled_articles`, a cada minuto).
- Painel editorial passou por typecheck/build e revisão pós-migração na Fase 47.
- **Fase 48**: acesso online ao acervo completo validado (23.217 confirmados no Supabase e num Preview publicado do `apps/site`; `/noticias` testado na página 1, intermediária, última e além-do-fim; editoria grande e busca conferidas; link permanente "Notícias" adicionado ao header/menu desktop e mobile, sem depender de placement). Staging separado do painel (`apps/sistema`) publicado em projeto Vercel isolado (`jornalir-sistema`), com `/login`/proteção de `/sistema/*` validados sem sessão — ver `docs/AI_HANDOFF.md` (Fase 48) para as URLs e os 3 problemas reais corrigidos na configuração.

## Fazer agora

1. **Login real no staging do painel** — ação do usuário: abrir a URL de Preview de `jornalir-sistema` (ver Fase 48 do handoff), entrar com credencial real de staff e percorrer login → matérias → edição → imagens → destaques → sair. Isso não pôde ser automatizado (exige sessão real).

2. **Google Drive do Jornal Online**
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
