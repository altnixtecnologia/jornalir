# Assinador / Agenda-Pauta — fechamento técnico em 09/11/2026

**Fonte atualizada para evitar repetir etapas já concluídas.** Relatórios de 08/11 que dizem “migrations não aplicadas” são históricos e foram superados pelas verificações abaixo.

## Produção confirmada
- Supabase: projeto `site-system-ir` (`iqnzrpdccecgalqboeyf`). **12/12 migrations de `20261122140000` a `20261122250000` aplicadas definitivamente em uma transação em 09/11**, com versões originais no ledger e tabelas verificadas. **Não reaplicar.**
- GitHub: PR [#22](https://github.com/altnixtecnologia/jornalir/pull/22) integrada no commit `0b7be673636a951d218f3641784c364916127e96` da branch `solicitacoes-financeiro-contratos-irc-20261031`. Contém Next.js 15.5.29 / React 19.1.10 do sistema administrativo e abas Agenda/Pauta no desktop.
- Teste dirigido da navegação: `apps/sistema/test/agenda-pauta-navigation.test.ts`. Só aparece a aba com a permissão de leitura correspondente; rotas `/sistema/agenda` e `/sistema/pauta`.
- Vercel: projeto `jornalir-sistema`, deploy produção `dpl_4gyowCFgJuNccbyvx6aiamHbHDcd`, estado READY, vinculado a `https://controle.altnix.com.br`. Build Preview integrado anteriormente READY no deployment `dpl_FTdh7RQ8TCddvnpyYGoNEyzbRjcb`.
- Consulta a erros de runtime logo após o deploy: nenhuma ocorrência reportada no intervalo consultado. Isso **não equivale a E2E com login** nem comprova os serviços externos.
- Portal público `apps/site` não foi alterado nesta integração; Next 14.2.33 permanece como pendência de segurança separada.

## Estado do assinador após publicar (leitura no banco)
- 0 perfis da empresa, 0 representantes legais cadastrados, 0 modelos contratuais ativos, 0 itens pendentes na fila de entregas.
- Código de rubricas estilo NixSign, assinatura da empresa, OTP do cliente, Google opcional, evidências, QR HMAC, entregas e backup foi integrado no sistema administrativo, mas não homologado em sessão autenticada.
- A variável `SIGNATURE_DELIVERY_ENABLED` não foi ativada; **não acionar e-mails, Meta, Telegram ou cobrança em testes** sem configuração e destinatários controlados.
- Ausentes ou não homologadas as configurações de Google, segredo/base de verificação QR, Resend, template Meta para assinatura, Telegram de contratos e backup R2 dedicado. Não imprimir segredos em documentos ou logs.

## Pendências operacionais — não mascarar como concluídas
1. Cadastrar e validar dados jurídicos da contratada, representantes e poderes no sistema.
2. Revisão jurídica e ativação consciente de cada versão dos modelos; atualmente 0 ativos. Testes somente com minutas explicitamente não vinculantes.
3. Testar no oficial, com sessão de usuário autorizado: Agenda/Pauta no desktop; empresa → PDF e rubricas → convite OTP ao signatário de teste → documento final e hash → verificação; confirmar também cenários de permissão negada e ausência de duplicata. Não criar contrato ou cobrança reais.
4. Configurar e validar separadamente credenciais, destinos e retenção de Google, QR, e-mail, Meta, Telegram e R2. Habilitar entrega somente após homologar cada provedor e reenvio idempotente.
5. Planejar atualização de segurança do portal público sem misturar com o sistema.
6. Sincronizar VS Code Windows por `git fetch` e fast-forward seguro na branch; preservar os 3 stashes e 3 worktrees, nunca fazer reset/rebase destrutivo por rotina.

**Regra:** não repetir migrations aplicadas nem auditorias gerais; focar pendências funcionais acima e testes de navegador oficial.


## 09/11/2026 — Nova Pauta quinta → quarta, interface compacta e sync flutuante

**PRODUÇÃO PUBLICADA E CONFIRMADA.** PR [#23](https://github.com/altnixtecnologia/jornalir/pull/23), merge de código `bd9f2f91af0c060db6cdda3a46e749871cbb72c4`; Vercel `jornalir-sistema` deploy `dpl_6SK9FWxtBxu26zdDMeEQ3y7uZty8`, estado READY, domínio `https://controle.altnix.com.br` confirmado nos aliases.

- Semana da **Pauta**: quinta a quarta (ex.: 05/11–11/11), sem alterar calendário convencional da **Agenda**.
- Lápis permite exceções de início/fim **somente da semana selecionada**, persistidas na tabela `pauta_week_overrides` e compartilhadas com toda a equipe; RLS: apenas gestor habilitado edita; trilha de auditoria e evento de Realtime.
- Menu do card: Agenda/Pauta, setas próximas do período e filtro no mesmo cabeçalho. Resumo e formulário compactos; apenas um botão `Nova pauta`.
- Formulário: tarefa ao lado da data/hora, responsáveis, observações expansíveis, opções `Criar somente na Pauta` e `Criar na Agenda + Pauta`. Internamente mantém identidade única da atividade editorial para status, conclusão por responsável e auditoria; a opção somente Pauta usa `agenda_events.show_in_agenda=false` para não aparecer no calendário da Agenda.
- Aviso de sincronização: flutuante, só durante edição realmente modificada, sem impedir atualização automática por manter formulário vazio aberto.
- Banco oficial `site-system-ir`: migration `20261122260000_pauta_quinta_quarta_periodos.sql` **aplicada** em transação definitiva e registrada com a mesma versão no ledger. Os **2 registros preexistentes** foram preservados e reancorados (semana 15/10 e 05/11); nenhuma pauta de teste ficou persistida.
- Testes: SQL no banco oficial com `BEGIN/ROLLBACK` confirmou criação das duas modalidades, rejeição de dia fora de período, bloqueio de alteração por operador, preservação dos dados; GitHub Actions [run 42625266333](https://github.com/altnixtecnologia/jornalir/actions/runs/42625266333) **verde**; Vercel Preview `dpl_h4uDaACDgUpuTiwcCmCma2Gtfw6A` READY antes da publicação oficial.
- Pós-deploy: consulta Vercel de runtime errors não encontrou falhas no período consultado. **Não substitui teste visual/logado de interação no navegador.**
- Portal público e assinador não foram modificados nesta PR. Não reaplicar migrations. Preservar 3 stashes e 3 worktrees ao sincronizar VS Code local; fazer `git fetch` e fast-forward seguro, sem reset/rebase destrutivo.
