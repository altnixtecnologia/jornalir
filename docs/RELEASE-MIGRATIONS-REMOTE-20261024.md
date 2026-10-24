# Pré-voo de migrações Supabase: leitura de 24/10/2026 — NÃO EXECUTAR

**Projeto consultado:** `site-system-ir` (somente metadados do histórico de migrations, sem ler dados de clientes).  
**Branch de comparação:** `feature/homologacao-integrada-ir-20261023` da PR #15.  
**Estado:** **NO-GO para `supabase db push`** até reconciliar manualmente as versões, verificar backup/restauração e receber autorização expressa do proprietário.

## Resultado verificado por leitura

- Versões registradas no Supabase real: **152**.
- Arquivos `.sql` em `supabase/migrations/` na branch: **195**.
- Versões idênticas presentes em ambos: **149**.
- Versões **somente no remoto**: **3**.
- Arquivos **ainda sem aquela versão no remoto**: **46**.
- As 3 versões remotas possuem **o mesmo nome** de arquivos locais com identificadores de versão diferentes. **Isso NÃO demonstra SQL idêntico nem permite marcar a versão como aplicada automaticamente.**

## Três correspondências prováveis, NÃO aprovadas

| Versão/nome no banco real | Possível arquivo correspondente no Git | Status |
|---|---|---|
| `20261020141318_mobile_app_android_release` | `20261030100400_mobile_app_android_release.sql` | **Conferir SQL/consequências antes de qualquer alteração** |
| `20261021220137_localities_state_code_for_geotargeting` | `20261021180000_localities_state_code_for_geotargeting.sql` | **Conferir SQL/consequências antes de qualquer alteração** |
| `20261021220149_native_push_geographic_routing` | `20261021190000_native_push_geographic_routing.sql` | **Conferir SQL/consequências antes de qualquer alteração** |

## Arquivos locais ainda sem a respectiva versão aplicada (46)

- `20261021180000_localities_state_code_for_geotargeting.sql`
- `20261021190000_native_push_geographic_routing.sql`
- `20261030100200_commercial_general_push_announcements.sql`
- `20261030100300_subscription_due_reminders.sql`
- `20261030100400_mobile_app_android_release.sql`
- `20261030100800_audit_scheduled_publish.sql`
- `20261030100900_joir_automation_rules.sql`
- `20261030101000_audit_events_viewer_indexes.sql`
- `20261031100000_commercial_sale_items_snapshot.sql`
- `20261101100000_commercial_equipment_rental_channel.sql`
- `20261102100000_staff_module_action_permissions.sql`
- `20261103100000_confirmed_staff_authorization.sql`
- `20261103103000_finance_actions_rls.sql`
- `20261104100000_nonfinancial_module_action_rls.sql`
- `20261104101000_save_client_action_guard.sql`
- `20261105100000_editorial_privileged_rpc_guards.sql`
- `20261105101000_editorial_birthdays_rls.sql`
- `20261106100000_nfse_operator_drafts_rls.sql`
- `20261107100000_rental_assets_bookings_inspections.sql`
- `20261108100000_commercial_contract_packages.sql`
- `20261109100000_commercial_contract_template_assignments.sql`
- `20261110100000_commercial_contract_auto_templates.sql`
- `20261111100000_commercial_contract_legal_approval_documents.sql`
- `20261112100000_commercial_signer_preparation.sql`
- `20261113100000_commercial_signature_workflow.sql`
- `20261115100000_auth_invitation_default_inactive.sql`
- `20261116100000_commercial_signature_attempt_recovery.sql`
- `20261118100000_commercial_contract_addenda.sql`
- `20261119100000_staff_membership_authorization.sql`
- `20261120100000_finance_webhook_dispatch_idempotency.sql`
- `20261120110000_payment_charge_update_restricted.sql`
- `20261120120000_atomic_manual_receivables.sql`
- `20261120130000_atomic_composition_receipts.sql`
- `20261120140000_atomic_manual_adjustments.sql`
- `20261120150000_atomic_reversal_guards.sql`
- `20261120160000_restrict_ledger_writes.sql`
- `20261120170000_protect_receivable_updates.sql`
- `20261120180000_rental_in_hand_integrity.sql`
- `20261120190000_birthday_entry_duplicate_guard.sql`
- `20261120200000_site_ad_publication_guard.sql`
- `20261120210000_site_ads_mutation_permissions.sql`
- `20261120220000_site_ads_manual_only.sql`
- `20261120230000_newspaper_edition_permissions.sql`
- `20261120240000_pdf_import_permissions_and_duplicate_lock.sql`
- `20261120250000_agenda_event_invitees.sql`
- `20261120260000_client_digital_export_approval.sql`

**Observação:** as três versões com nomes equivalentes estão **incluídas** nos 46 arquivos não registrados. O conjunto completo não deve ser tratado como 46 migrações efetivamente inéditas antes da conciliação. Outros arquivos incluem NFS-e, cujo módulo foi **adiado para depois da publicação**, mas a interdependência de schema exige análise: não remover/aplicar SQL isoladamente sem auditoria.

## Protocolo obrigatório (somente antes do GO)

1. Conferir a tabela `supabase_migrations.schema_migrations` por **leitura** e comparar, para as 3 versões equivalentes apenas pelo nome, o SQL efetivamente executado com o SQL versionado na branch (sem assumir que timestamp/filename é evidência suficiente).
2. Identificar dependências e alterações destrutivas das demais migrations; preparar sequência de ensaio em **clone/sandbox**, sem bancos reais ou chaves Production.
3. Fazer inventário e teste de restauração de backups/objetos R2 e validar roteiro de rollback. Não editar a tabela de migration ledger para fazê-la "bater".
4. Executar o utilitário read-only `scripts/release/migration-preflight.mjs` contra uma exportação **atualizada** de `{"migrations":[{"version":"...","name":"..."}]}`. A ferramenta não acessa DB, não altera histórico e sinaliza divergência com exit code 2.
5. Após revisão por responsável e autorização **específica**, ensaiar exatamente a mesma ordem/versões contra banco descartável com estado equivalente. Nunca fazer `db push` só porque o CI de schema vazio ficou verde.

## Outras verificações de publicação em 24/10/2026

- **Vercel `jornalir-sistema`:** há `ASAAS_API_KEY_PRODUCTION` tanto no target `production` como no target `preview`. Isso é um risco de exposição de credencial em Preview, **não foi lido nenhum valor**. Requer remoção da variável de Preview no painel da Vercel **com autorização do proprietário**, revisão da política Asaas e confirmação de que a chave válida de homologação só aparece no ambiente apropriado. Não alterar automaticamente envs sensíveis.
- **Vercel `jornalir`:** metadados mostram R2 configurado para Preview e nenhum grupo R2 listado para Production na consulta. **Verificar se o portal de produção realmente precisa dessas variáveis** antes de classificar como problema (imagens podem ser lidas por URLs públicas já gravadas). Não criar segredo desnecessário.
- **Auto-deploy da Vercel:** o conector confirmou os projetos e alvos das variáveis, mas NÃO forneceu uma confirmação confiável do toggle Git Auto Deployment. Fazer conferência manual.
- As variações `SUPABASE_SERVICE_ROLE_KEY` e URLs para Preview/Production no painel **não foram descriptografadas nem comparadas**. Confirmar isolação dos ambientes sem expor valores em chat/log.
- **CI `npm ci`:** corrigido no bloco anterior e agora estrito; **não substitui** homologação externa.

**Fonte de release:** `docs/PRE-PUBLICACAO-IR-20261024.md`, PR #15. **Não atualizar automaticamente a main, não publicar, não tocar Altnix Informativo ou NFS-e.**
