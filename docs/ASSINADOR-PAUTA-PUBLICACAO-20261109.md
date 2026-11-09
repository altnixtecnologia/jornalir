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
