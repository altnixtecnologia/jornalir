# Módulo 10 — cadastro e financeiro mestres do Jornal IR (decisão atualizada 24/10/2026)

> **ESTADO: preparação exclusiva no JORNAL IR. INTEGRAÇÃO COM ALTNIX INFORMATIVO DESLIGADA. NÃO PUBLICAR.**
> Esta decisão prevalece sobre roteiros antigos que sugeriam copiar cadastros em ambos os sentidos ou fazer publicação gradual.
> Não é autorização para alterar o repositório, banco, Vercel, aparelhos, painel, playlists ou mídia do Altnix.

## Escopo que o proprietário aprovou

1. O **Jornal IR** será a fonte de verdade para o cadastro de pessoas/empresas, para contratos de serviços comerciais, títulos, cobrança, recebimento, crédito, estorno, vencimento e futuras permissões comerciais.
2. O **Altnix Informativo** permanece inalterado e opera independentemente, com seus clientes/mídias/contratos atuais. **Não editar código ou aplicar migrations no seu repositório nesta etapa.**
3. A integração será feita **somente em um lote de publicação futuro**, após finalizar, organizar e homologar todos os módulos relevantes do Jornal IR, incluindo contratos, financeiro, cadastro e vínculo inequívoco de mídias, playlists e telas. O proprietário dará aval expresso para liberar a integração e fazer testes com dispositivos de laboratório.
4. É proibido suspender ou liberar mídias hoje com base em qualquer mudança feita no Jornal IR. Nem eventos financeiros nem alteração de cliente podem iniciar comunicação remota.
5. Nada de cadastros mestres concorrentes: **no Jornal IR `public.clients` é o cadastro mestre**; no Altnix a tabela `public.clients` é o **tenant/organização**, NÃO o cadastro de anunciantes. O cadastro comercial no Altnix é `public.ad_clients`. Não ligar PKs homônimas, compartilhar UUID como PK nem sobrescrever registros remotamente.

## O que já existe na PR #15 — NÃO confundir com integração ativa

- Cadastro central no Jornal IR, inclusive CPF/CNPJ únicos, contato e endereço, usado pelos módulos comercial/contratos/financeiro.
- `client_digital_export_permissions`: controle **interno de pré-autorização** individual, concedida/revogada por admin ou owner confirmado. Pré-autorização **não envia dado** e **não autoriza veiculação**.
- `/api/integrations/altnix/clients`: código de consulta servidor-a-servidor, apenas informações comuns e somente dos clientes pré-aprovados; protegido por segredo e variável de ambiente.
- **Trava dupla adicional desta etapa:** `ALTNIX_CLIENT_EXPORT_RELEASED = false` no código, mais `ALTNIX_CLIENT_SYNC_ENABLED` por ambiente; enquanto o primeiro estiver falso, o endpoint retorna **503 para qualquer requisição, inclusive com token válido e flag env ativada**. Remover a trava exige mudança revisada em um release futuro e autorização expressa; não fazer isso nesta PR.
- A própria tela administrativa avisa que só existe **pré-autorização futura** e que a ligação está desligada.
- Testes de autorização/RLS rodam exclusivamente em banco temporário no CI.
- **Não implementado e não autorizado nesta fase:** consumidor Altnix, link de anúncios, replicação real, emissão de cobrança no Altnix, sincronização de recebíveis, comando de liberação/suspensão, dispositivo ou player.

## O que falta organizar DO LADO DO JORNAL, sem transmitir nada

- Certificar-se de que toda venda, contrato, documento, parcela e recebível aponta ao **mesmo `client_id` mestre** e que qualquer serviço comercial possui identidade estável por **linha de venda/serviço**.
- Definir, para o futuro, um vínculo formal validado e auditável entre `client_id`, `commercial_sale_id`, `commercial_sale_item_id` (ou identificador efetivo da linha de serviço), contratos/documentos, `receivable_id` e **cada alvo de exibição específico** (mídia, playlist, tela, período). **Não criar vínculo fictício ou por CPF/nome.**
- Documentar os estados financeiros com pagamentos parciais, contestação, crédito, estorno, cancelamento, carência e acordos sem deduzir "suspensão global"; autorização comercial deverá ser própria e versionada por serviço, nunca exclusivamente por status do cliente.
- Conciliar e homologar Asaas Sandbox, WhatsApp em testes e RLS de operadores antes de tratar qualquer baixa como permissão de exibição.
- Não criar neste estágio tabela de `media_entitlements`, outbox remoto, trigger de suspensão, webhook para Altnix, job periódico nem endpoints para controlar players só por constarem em um planejamento.

## Limites comerciais inegociáveis

- **Patrocinadores no portal:** são **bônus gratuitos**, adicionados/removidos **manualmente**. Não exigir cadastro, venda, contrato, recebível ou qualquer gatilho de suspensão.
- **Mídias comerciais pagas no Altnix:** a integração financeira futura somente atuará sobre o serviço e o alvo de mídia explicitamente vinculados ao título correspondente. Dívida de outro contrato, serviço ou parcela NÃO derruba os anúncios gerais do cliente.
- **Permuta, comodato e cortesia:** não geram suspensão por suposta inadimplência.
- Suspensão futura requer política aprovada de tolerância/contestação, prévia do impacto, permissão de administrador, auditoria e reversão validada depois de quitação confirmada, não de botão/WhatsApp isolado.
- Aparelhos offline deverão reconciliação idempotente com versão, confirmação por tela, reprocessamento seguro e sem tocar OTA. Tudo isso é **projeto futuro, não implementação atual**.

## Separação operacional e branches

- **Jornal IR:** trabalhar somente na branch isolada da PR #15 `feature/homologacao-integrada-ir-20261023`, em draft. Sem merge/main/deploy/migrations no remoto.
- **Altnix Informativo:** não alterar **nem para desenvolvimento** nesta etapa. Em investigação anterior, foi criada experimentalmente a branch `feature/jornalir-clientes-integrados-20261024` no repositório Altnix. **Ela NÃO foi mesclada, não foi publicada e NÃO DEVE SER USADA**, salvo nova autorização expressa para avaliar/descartar separadamente. `main` e produção Altnix não foram tocadas nessa investigação.
- O sistema de publicação em lote de cadastros/mídias só será aberto em ocasião futura, com decisão humana expressa e plano de rollback.

## Critérios para abrir o futuro lote de integração

- Todos os módulos relevantes do Jornal IR aprovados em CI e homologados com dados controlados (não apenas builds verdes).
- Identidade e relações comerciais únicas e consistentes, permissões granulares, rastreabilidade e conciliação de cobranças verificadas.
- Plano completo de migração/deduplicação de clientes do Altnix **sem escrita automática**, com prévia de mapeamento, backup e aprovação; só então integrar `ad_clients` como consumidor subordinado.
- Testar pagamento parcial, atraso, PIX duplicado, outro contrato vencido, contestação, estorno, cortesias, várias mídias/telas e aparelhos offline.
- Separar os dois lotes futuros: **A. preparar/validar lado Jornal** (sem liberar API remota); **B. integração Altnix + homologação de laboratório + publicação controlada**, como um release conjunto autorizado.

**Referências:** issue #18; PR #15; `docs/ROTEIRO-FECHAMENTO-MODULOS-20261024.md`.
