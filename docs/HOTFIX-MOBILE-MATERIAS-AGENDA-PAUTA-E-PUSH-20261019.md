# Jornal IR — correções mobile e pendência de push editorial — 19/10/2026

## Contexto e autorização
- Proprietário autorizou corrigir problemas do painel mobile e implementar o envio automático na publicação de matérias, incluindo agendadas, após homologação segura.
- Fluxo desejado: "Sem notificação" => nenhum push; "Normal" => push comum; "Urgente" => canal urgente; publicação agendada => notificar quando de fato publicada; reedição não duplica.
- Dois celulares do jornal com APK piloto; teste manual normal foi confirmado pelo proprietário. Não houve autorização para envio irrestrito sem validação dos dois modos.

## Estado verificado da produção antes deste hotfix
- Projeto Supabase: `site-system-ir` (`iqnzrpdccecgalqboeyf`).
- `articles`: 23.496 registros, logo o desaparecimento no mobile não era perda de dados.
- `notification_events`: 0 registros na verificação; gatilho `article_push_on_published` existente/habilitado, mas a rota legada aponta para `notification_outbox`.
- Tabelas `site_notification_feature_flags` e `site_notification_reads` ausentes, migrações propostas `20261030100600` e `20261030100500` ainda não aplicadas nesta etapa.
- 2 registros em `native_push_devices` (não confundir quantidade cadastrada com garantia de receber avisos).
- Vercel sistema: deploy anterior de produção `dpl_D9tcK1o2rmYgpv4wn5BetYwEQ5E4` READY, SHA `10afa958`.
- Vercel site: deploy anterior de produção `dpl_5LKi5gxA69a1eFS6T32bwpmsbSM3` READY; primeira abertura já implementada.

## Diagnósticos confirmados pelo código
1. Em `apps/sistema/src/app/globals.css`, a regra `@media(max-width:720px){.materias-cards{display:flex}}` vinha ANTES da declaração base `.materias-cards{display:none}`. Com a mesma especificidade, a regra posterior ocultava cartões no celular enquanto a tabela desktop também era ocultada. Corrigido com regra de viewport ao FINAL do CSS.
2. Em `apps/sistema/src/components/admin/AdminShell.tsx`, a aba Agenda usava apenas `pathname.startsWith("/sistema/agenda")`, e Pauta não recebia `aria-current`. Ambas as opções compartilham `/sistema/agenda` e diferem por `?view=pauta`. Corrigido ao considerar `useSearchParams()` para identificar a aba efetiva.
3. `MobileNav.tsx` também ignorava a query na indicação de link ativo. Corrigido para Agenda/Pauta, com `Suspense` delimitado no componente consumidor de search params, sem impor bailout no layout inteiro.
4. `apps/sistema/src/app/sistema/editorial/materias/page.tsx` já consulta paginação server-side (`force-dynamic`) e `MateriasList` já renderiza cards. Não alterado o serviço editorial, filtros, permissões ou dados.

## O que foi alterado nesta branch
- `apps/sistema/src/app/globals.css`: restaura cartões de matérias somente sob 720px, mantém tabela desktop.
- `apps/sistema/src/components/admin/AdminShell.tsx`: realce correto no menu inferior, conforme parâmetro `view`.
- `apps/sistema/src/components/admin/MobileNav.tsx`: realce correto do item de menu expandido.
- Esta documentação.
- `main` NÃO alterada; nenhuma mudança no APK.

## Testes e implantação
- Uma compilação de preview foi solicitada à Vercel para `jornalir-sistema` (deploy `dpl_eCZ134w9usqKBY6mb8WB2RMPAAS5`). Conferir estado final antes de promover.
- Nenhum deploy de produção das correções realizado nesta branch na hora desta documentação; publicação exige build READY e aceitação no mobile.
- Após publicar: abrir `/sistema/editorial/materias` num celular, verificar cartões com e sem filtros; abrir Agenda e Pauta na barra inferior, confirmar apenas o item correspondente marcado; verificar menu expandido; garantir desktop preservado.
- Não há como comprovar visualmente o funcionamento autenticado do celular sem uma sessão de teste.

## Envio automático — AINDA NÃO LIGADO
- Já existe migration proposta `supabase/migrations/20261030100600_article_publish_notification_events.sql`, que atualiza `queue_article_push_on_publish()` para criar `notification_events`, e usa `site_notification_feature_flags.article_publish_events_enabled = false` como trava.
- Antes de aplicar, revisar os side effects do insert em `audit_events` dentro do trigger, a configuração de delivery FCM, event scope, event key única e o `pg_cron` de matérias agendadas. Confirmar testes unitários/transacionais de "sem/normal/urgente" (publicação direta e agendada, duplicação).
- Manter `NATIVE_FCM_DELIVERY_ENABLED=false` até homologar envio normal + urgente para aparelho(s) de teste. Flag de geração editorial e flag de entrega FCM são etapas separadas.
- O usuário autorizou essa etapa na conversa, mas a autorização não comprova que os testes já foram executados: NÃO declarar ativação concluída prematuramente.

## Para Claude Code no computador local
1. Antes de sincronizar, salvar alterações locais, `git fetch --all --prune` e inspecionar `git status`, `git log` e `git diff` (sem reset nem sobrescrever trabalho).
2. Branch `fix/mobile-materias-agenda-pauta-20261019`; comparar com versão do sistema em produção (SHA `10afa958`) e com a branch de primeiro acesso `feature/ativacao-inicial-notificacoes-20261019`.
3. Revisar exatamente os três arquivos do hotfix; rodar lint/typecheck/build antes de integrar; o preview Vercel isolado não é produção.
4. Não misturar o hotfix mobile com a ativação automática de push ainda pendente, nem publicar/deployar ou alterar dispositivos sem autorização vigente e testes.
