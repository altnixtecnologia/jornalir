# Auditoria somente leitura — Jornal IR + Altnix Informativo + Asaas — 16/11/2026

**NATUREZA:** fotografia operacional e técnica, SEM AUTORIZAÇÃO para executar alterações. Consultas exclusivamente SELECT/inspeção de código e metadados de ambiente. Nenhuma chave de API, token, documento pessoal, payload financeiro nem identificador de cliente foi registrado neste documento.

**Fontes verificadas em 16/11:** projetos Supabase `site-system-ir` e `altnix-informativo`; variáveis de ambiente cadastradas (somente nomes e escopos) nos projetos Vercel `jornalir-sistema` e `altnix-informativo`; código `main` do Informativo. Ver também [plano técnico](PLANO-INTEGRACAO-IR-INFORMATIVO-CONTRATO-20261116.md), [alinhamento](ALINHAMENTO-IR-INFORMATIVO-NFSE-20261111.md) e [restrições anteriores](ALTNIX-INFORMATIVO-SYNC-FUTURO.md).

## 1. Quantitativos observados
| Indicador | Jornal IR | Altnix Informativo |
| --- | ---: | ---: |
| `clients` (IR comercial; Informativo tenants) | 4 | 13 |
| `ad_clients` | não aplicável | 16 (4 active, 12 archived) |
| `commercial_sales` | 0 | não aplicável |
| `commercial_contract_packages` / `ad_contracts` | 0 | 16 |
| `commercial_contract_services` / `ad_contract_items` | 0 | 0 |
| `receivables` / `billing_invoices` | 1 | 13 |
| `payment_charges` / `billing_payments` | 2 | 4 |
| `receivable_receipts` | 1 | não aplicável |
| Eventos de webhook de cobrança | 2 | 10 |
| `media_assets` | não comparar (finalidade distinta) | 172 |
| `ad_contract_screen_targets` | não aplicável | 0 |
| `screens` | não aplicável | 3 |

Os números são de tabelas distintas, sem equivalência contábil direta. Na data da auditoria há apenas 1 recebível no Jornal IR e nenhum registro de venda/serviço comercial; **não é possível homologar com dados reais o vínculo completo contrato→serviço→cobrança→tela**.

## 2. Estado do Asaas existente — REUTILIZAR, NÃO DUPLICAR
- **Jornal IR:** 1 registro em `billing_provider_settings` com `provider=asaas`, `environment=production`, `enabled=true`, PIX habilitado; boleto e cartão desabilitados nessa configuração; autoenvio após aprovação desabilitado.
- **Jornal IR:** 1 cliente com `asaas_customer_id` e ambiente production. Duas cobranças Asaas (1 paid e 1 cancelled) e 2 eventos de webhook (`PAYMENT_RECEIVED`, `PAYMENT_DELETED`), ambos processados.
- **Informativo:** 16 perfis financeiros; 2 com `asaas_customer_id` em production. Faturas com `provider=asaas`: 2 paid e 1 void (há também faturas `manual`). Pagamentos Asaas: 1 PIX confirmed, 1 credit_card confirmed, 1 PIX cancelled. Há 10 eventos Asaas com assinatura validada no histórico.
- **Metadados Vercel sem decifração:** Informativo possui `ASAAS_API_KEY`, `ASAAS_ENV` e `ASAAS_WEBHOOK_TOKEN`, registrados para production e preview; Jornal IR Sistema possui `ASAAS_API_KEY_PRODUCTION` e `ASAAS_WEBHOOK_TOKEN` em production, `ASAAS_ENV` em production, e uma chave com mesmo nome em preview. **Presença de variável não comprova validade, titularidade da conta, escopo ou funcionamento atual**.
- **Ação futura obrigatória:** confirmar, por verificação não transacional e autorizada, se ambas as aplicações usam a mesma conta/empresa Asaas, ambiente e cliente correspondente. Não copiar nem revelar tokens; não trocar credenciais agora. Comparar em homologação PIX, cartão, webhook e idempotência, sem criar cobranças reais.

## 3. Integridade e vínculos
- No Jornal, SELECTs de relacionamentos verificaram zero divergências para `commercial_contract_packages.client_id` vs venda, `receivables.client_id` vs venda/assinatura e `payment_charges.client_id` vs recebível; entretanto as tabelas comerciais de vendas/pacotes estão vazias. Os 4 clientes têm algum documento cadastrado (sem validar dados ou dígitos verificadores).
- No Informativo, SELECTs verificaram zero divergências de tenant em contratos, perfis financeiros, faturas, pagamentos e mídias vinculadas; não foram verificadas todas as regras de autorização/RLS da aplicação.
- Todos os 4 anunciantes ativos do Informativo ainda têm `jornalir_client_id IS NULL`; os 12 arquivados também não possuem vinculação. Nenhuma associação automática foi criada ou proposta como definitiva.
- **Alerta de granularidade:** `ad_contract_items=0` e `ad_contract_screen_targets=0`. Antes de qualquer autorização ou suspensão por serviço/tela, verificar qual é a fonte operacional real do vínculo mídia↔playlist↔tela↔contrato; não inferir a partir de `payment_status` global.
- `ad_contracts`: 9 active em comodato, 1 active em permuta, 2 past_due standard e 4 draft standard. Comodato/permuta não podem produzir bloqueio por inadimplência inferida.

## 4. Ponto de atenção: webhook Asaas do Informativo
- Dos 10 eventos: **4 sem `processed_at` e com `processing_error`**:
  - 1 `PAYMENT_CONFIRMED`: evento sem identificador de fatura;
  - 1 `PAYMENT_DELETED`: fatura interna não encontrada;
  - 2 `PAYMENT_RECEIVED`: 1 fatura não encontrada e 1 sem identificador de fatura.
- Inspeção de `dashboard-next/app/api/webhooks/asaas/route.ts` em `main`: o webhook autentica o token, registra o evento, processa pagamento e marca `processed_at`; na exceção grava `processing_error` e retorna HTTP 200 com `deferred:true`. Repetição de `provider_event_id` já registrado retorna HTTP 200 `duplicate:true` sem reprocessamento no próprio handler. **Risco de evento não conciliado permanecer pendente**; avaliar mecanismo controlado de replay com validação, segurança e idempotência ANTES de implementá-lo. Não reexecutar os 4 eventos automaticamente.
- `dashboard-next/app/api/internal/billing/reconcile/route.ts` chama a RPC `refresh_financial_entitlements` e outras rotinas operacionais. **Não acionar essa rota nesta auditoria**, pois executa efeitos no sistema atual.
- A auditoria NÃO comprova problema de chave Asaas: os erros dos quatro eventos são de associação com fatura, e não de autenticação pela API. O relato de erro de chave na experiência de checkout requer investigação separada com logs redigidos e verificação de configuração, sem expor segredo.

## 5. Sequência de preparação autorizada sem escrita de dados
1. Revisar o contrato cadastral e o fluxo financeiro no código atual do Jornal (branch de trabalho), identificando pontos de reuso de `clients`, `commercial_sales`, `commercial_contract_services`, `subscriptions`, `receivables`, `payment_charges`.
2. Projetar **apenas na documentação** o vínculo auditável entre `IR.clients.id` e o par `Informativo.(tenant_id, ad_client_id)`; conciliação por CPF/CNPJ exato é sugestão, nunca ativação. Validar os 4 anunciantes ativos com revisão humana numa etapa posterior.
3. Desenhar vínculo de serviço comercial e alvo operacional com origem de cobrança, ID de fatura e período. Preservar faturas do Informativo sem importação financeira automática e sem duplicidade de `provider_payment_id`.
4. Mapear regras de meio de pagamento: IR production configurado PIX, Informativo com PIX e cartão historicamente confirmados; decidir configuração mestra só depois da verificação de mesma conta Asaas e política comercial.
5. Investigar os 4 erros de webhook e o relato de erro de chave do checkout em processo de homologação controlado, sem mutação nesta fase.
6. Preparar segurança por usuário↔cliente e serviço↔alvo, trilha de auditoria e testes para pagamentos parciais, cancelamentos, estornos, comodatos, permutas, múltiplos serviços e equipamentos offline.
7. Só após aprovação explícita: implementação desativada e testada do lado Jornal; depois adaptar receptor no Informativo; conciliação final e corte financeiro com rollback em release autorizado.

## 6. Limites e próximos gates
- **Nenhuma alteração executada** em banco, Vercel, Asaas, mídia, contrato, webhook, player ou operação do Informativo. Auditoria não efetuou acesso aos valores dos segredos e não chamou API de cobrança.
- Não habilitar `ALTNIX_CLIENT_EXPORT_RELEASED`, não remover travas, não executar migrations nem publicar a integração.
- A NFS-e do Jornal IR continua a prioridade operacional, com integração em preparação paralela documental.
- Próximo gate é validação humana do inventário, consistência de IDs de serviço e autorização para testes não transacionais da identidade Asaas. Integração financeira permanece DESLIGADA.
