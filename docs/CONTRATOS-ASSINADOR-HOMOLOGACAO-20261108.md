# Contratos e Assinador — homologação controlada após Etapas 1–4
Data de registro: 08/11/2026
Branch: `solicitacoes-financeiro-contratos-irc-20261031`
Base do resultado CI: `45c655e25523a25e0345db5e4869fabb4de06b7d`

> Esta é a sequência de HOMOLOGAÇÃO, não uma autorização para executar etapas em produção. **Nenhuma migration, publicação, envio real, backup ou assinatura foi executada** no desenvolvimento remoto do ChatGPT. Guardar 3 stashes e 3 worktrees locais intactos. Evitar auditorias gerais repetidas.

## Evidência de código já verificada no GitHub (não repetir sem motivo)
- GitHub Actions: `Verificar contratos e assinaturas (sem deploy)`, execução [**42532655263**](https://github.com/altnixtecnologia/jornalir/actions/runs/42532655263/job/128890054225). Resultado: **SUCESSO** em `45c655e2`.
- `npm run typecheck --workspace @ir/sistema` — passou.
- Testes direcionados `external-signature-placement`, `external-signed-pdf-smoke`, `google-signature-proof`, `public-verification`: **10/10 aprovados**, inclusive PDF em memória com rubricas da empresa e cliente, assinatura desenhada, QR e hash de versões preservadas; nonce/JWT Google com casos negativos; QR adulterado rejeitado.
- `npm run build --workspace @ir/sistema`: **passou**, sem deploy.
- Ainda NÃO testados: permissões/RLS reais após SQL, Storage real, visualização pelo usuário, Google real, Meta/Resend/Telegram reais, R2 backup/restore reais e texto dos contratos por revisão jurídica.
- O npm avisou que `next@14.2.33` tem atualização de segurança pendente. **Revisar antes da publicação**, em atividade separada, sem mudar versão automaticamente durante o fechamento do assinador.

## Barreiras antes de produção (exigem autorização específica)
1. **Sincronização do PC**: Claude Code, quando disponível, somente `git fetch` + conferência do branch e `fast-forward` seguro. Não modificar stashes/worktrees. Não fazer merge forçado, reset, rebase destrutivo ou deploy. Se houver trabalho local divergente, parar e reportar.
2. **Migrações**: existem **12 migrations não aplicadas** de `20261122140000` até `20261122250000`, com intervalos conforme arquivos reais em `supabase/migrations`. Antes de aplicar, comparar com ledger e executar uma validação dirigida do SQL em ambiente seguro; conferir tabelas existentes, RLS, grants, triggers e efeitos das policies. **Somente aplicar mediante autorização explícita.** Não publicar o código antes do SQL aprovado.
3. **Serviços separados e desligados por padrão**: Google, Resend, Telegram, Meta Cloud API e R2 privado requerem configuração real e destinos de teste. `SIGNATURE_DELIVERY_ENABLED` deve continuar `false` até aceite. Não configurar credenciais no repositório.
4. **Pré-condições jurídicas**: confirmar texto de consentimento e poderes, aprovação humana das minutas, guarda/retensão LGPD de assinaturas antigas e política de guarda dos contratos. Não tratar Google, rubrica gráfica ou QR isoladamente como assinatura ICP-Brasil.

## Homologação direcionada — um fluxo por modalidade e testes de bloqueio essenciais
- [ ] **Contrato comercial**: cliente e serviços combinados (catálogo, assinatura jornal, serviço avulso), preço especial com/sem permissão; modelo em teste sem cobranças; representante comercial com e sem `contratos_assinar`. Confirmar que valores, vigências, escolha de modelo e documentos correspondem.
- [ ] **Assinatura pela empresa**: ato explícito, reconfirmação de senha, hash da versão e PNG (se cadastrado). Rubricas só após confirmação; original preservado. Bloquear troca de representante depois de iniciado.
- [ ] **Contrato institucional**: representante dentro dos poderes, modalidade conjunta com dois representantes distintos; teste negativo de poderes vencidos. Cliente somente após a empresa concluir.
- [ ] **Assinatura do cliente**: OTP de e-mail obrigatório, opcional Google sem trocar sessão, leitura do mesmo PDF que será aceito, desenho de assinatura e consentimento. Rejeitar se o PDF mudar após a leitura. Conferir QR, hash público e PDF consolidado; página de QR sem PII ou download.
- [ ] **Posicionamento NixSign**: um modelo PDF em rascunho, desenhar retângulos da empresa e do cliente, rubrica e data; reabrir e confirmar posições; aprovação congela layout. Verificar que não cobre texto do documento. Conferir também posicionamento automático em modelo interno.
- [ ] **Mensagens**: com template Meta aprovado e opt-in, testar convite para destinatários de homologação; confirmar diferença entre `accepted_by_meta` e entrega. Habilitar em teste controlado Resend + Telegram após rodadas terminarem. Provocar falha de rede e confirmar `uncertain` sem reenvio automático. Não usar destinatários reais sem autorização.
- [ ] **Backup R2 dedicado**: `node apps/sistema/scripts/signature-backup.mjs --dry-run`, depois cópia/manifesto com autorização; `--verify <manifest-key>` e `--restore-test <manifest-key>`. Validar acesso ao bucket privado, hash e restauração. O script **não restaura automaticamente o banco Supabase**; testar plano de recuperação de banco separadamente.
- [ ] **Aceite de publicação**: confirmar backups, aprovação jurídica, disponibilidade de serviços e resultado de homologação; aplicar migrations antes de qualquer deploy. Registrar versão publicada e plano de contingência. Não emitir cobranças/assinaturas reais no ensaio.

## Segredos e configurações — somente painel do ambiente autorizado
- Google Identity Services: `NEXT_PUBLIC_GOOGLE_SIGNATURE_CLIENT_ID`; `SIGNATURE_GOOGLE_NONCE_SECRET` (servidor); origem autorizada do domínio.
- QR: `SIGNATURE_VERIFICATION_SECRET` (servidor) e `SIGNATURE_VERIFICATION_BASE_URL` HTTPS.
- Envio: `SIGNATURE_EMAIL_API_KEY`, `SIGNATURE_EMAIL_FROM` (remetente Resend validado); `CONTRACTS_TELEGRAM_BOT_TOKEN`, `CONTRACTS_TELEGRAM_CHAT_ID`; `CRON_SECRET`, `SIGNATURE_DELIVERY_ENABLED` inicialmente falso. Agendamento da rota é posterior e deve reaproveitar `pg_cron/pg_net` existente, se homologado.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e template `WHATSAPP_SIGNATURE_INVITE_TEMPLATE` com aprovação Meta.
- R2 backup independente: `SIGNATURE_BACKUP_R2_ENDPOINT`, `SIGNATURE_BACKUP_R2_BUCKET`, `SIGNATURE_BACKUP_R2_ACCESS_KEY_ID`, `SIGNATURE_BACKUP_R2_SECRET_ACCESS_KEY`, além da service role Supabase em ambiente confiável.

**Critério para encerrar a Etapa 5:** além do build verde, todas as verificações acima pertinentes ao ambiente estiverem registradas, com assinatura PDF verificada, notificações e backup reais homologados e decisões jurídicas/operacionais aprovadas. Até lá, a implementação está **pronta em código**, não pronta em produção.


## Prova adicional de SQL, somente banco temporário

[GitHub Actions 42535689362](https://github.com/altnixtecnologia/jornalir/actions/runs/42535689362/job/128899363347) **verde**: migrations `20261122240000`/`250000` executadas em PostgreSQL 17 **isolado** com schema fictício e ensaio de fila/Meta. **Nenhuma migration aplicada ao Supabase real**. Ledger real lido: aplicado até `20261122130000`, 12 de assinatura pendentes. Não repetir este smoke salvo mudança nessas duas migrations; ainda exige homologação integrada de todas as 12 com autorização.


## Prova de Google e editor visual no banco temporário

[GitHub Actions 42535940585](https://github.com/altnixtecnologia/jornalir/actions/runs/42535940585/job/128900124661) **verde**: migrations `220000` e `230000` aplicadas somente em PostgreSQL 17 isolado, com teste de unicidade/imutabilidade/RLS para a evidência Google e de congelamento das posições do PDF após aprovação jurídica. Junto do smoke anterior (fila/Meta), quatro migrations passaram em banco sintético; ainda resta a homologação da cadeia de 12 no ambiente integrado, sem mudança de produção até autorização expressa.
