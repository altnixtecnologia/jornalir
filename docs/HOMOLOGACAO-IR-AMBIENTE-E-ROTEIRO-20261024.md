# Jornal IR — preparação operacional da homologação
**Estado:** código e controles do CI preparados; **ambiente integrado ainda não ativado**. Não constitui GO de produção.

## Decisões preservadas
- **Homologar antes de publicar**: PR #15 permanece draft, sem merge e sem deploy da branch.
- **NFS-e fica depois da publicação.** O módulo está desabilitado no release; não realizar emissão ou enviar certificados.
- **Altnix Informativo não pode ser alterado nem conectado.** Exportação bloqueada em código. Patrocinadores gratuitos no portal não integram cadastro, contratos nem cobrança.
- Não utilizar clientes, contatos, notas ou títulos reais no ambiente de testes.

## Ambiente isolado exigido — pendente de aprovação do custo

O conector Supabase tentou criar um branch de desenvolvimento sem dados reais, mas a plataforma exigiu `confirm_cost_id`. Custo consultado na organização Altnix em 24/10/2026: **US$ 0,01344 por hora** (US$ 0,32256/24h contínuas), variável conforme tempo ativo. **O usuário ainda não autorizou a cobrança; nenhum branch foi criado.** Sem a autorização, é proibido criar o recurso. Se aprovado, usar branch `homologacao-jornalir-20261024` e desligá-lo após o período de testes para evitar custos recorrentes. Conferir custos reais e limites antes do consentimento.

Quando existir projeto sandbox:
1. Confirmar **project_ref da filial isolada**, URL própria `https://<ref>.supabase.co` e credenciais próprias do sandbox; nunca usar a referência de Production `iqnzrpdccecgalqboeyf`.
2. Conferir o histórico de migrations do sandbox e ensaiar as 43 alterações pendentes, reconciliando primeiro os três nomes com timestamps distintos e SQL idêntico. Não importar dados reais nem executar `migration repair` na Production.
3. Criar usuário owner de **laboratório** com dados fictícios e senha de teste. Colaboradores entram por convite, nascem inativos e exigem confirmação do e-mail. Validar membership antes de habilitar cada papel.
4. Configurar somente as variáveis **Preview** da Vercel com credenciais sandbox; mantê-las mascaradas. As variáveis Preview atuais do painel e do R2 são intencionalmente inertes. Não tocar Production.
5. Manter Vercel Authentication para Preview nos dois projetos; expor um único Preview autorizado para a equipe, não necessariamente publicar o site em Production.
6. Usar bucket R2 **separado**, sem acesso ao acervo real, limitado aos artefatos de teste. Asaas apenas Sandbox. WhatsApp apenas número/test recipient permitido na conta de laboratório. FCM Web Push/Telegram só em laboratório.
7. Depois da homologação, documentar aprovação/recusa e desmontar recursos temporários, sem deixar credenciais de testes em Production.

## Variáveis de HOMOLOGAÇÃO — referências, jamais valores reais neste documento

| Projeto | Variável | Regra |
|---|---|---|
| `jornalir-sistema` Preview | `VERCEL_ENV` | Definida pela Vercel como `preview` |
| `jornalir-sistema` Preview | `IR_HOMOLOGATION_ENABLED` | Apenas `true` quando ambiente sandbox estiver provisionado |
| `jornalir-sistema` Preview | `IR_HOMOLOGATION_SUPABASE_REF` | Referência da instância sandbox, **nunca** da Production |
| `jornalir-sistema` Preview | `NEXT_PUBLIC_SUPABASE_URL` | URL exata `https://<sandbox-ref>.supabase.co`, sem paths/query |
| `jornalir-sistema` Preview | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Apenas chave publicável do sandbox |
| `jornalir-sistema` Preview | `SUPABASE_SERVICE_ROLE_KEY` | Apenas chave de serviço do sandbox, exclusiva do servidor |
| `jornalir` Preview | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | O mesmo banco **sandbox** do painel; site nunca recebe `service_role` |
| `jornalir-sistema` Preview | `ASAAS_ENV` | `sandbox`; `ASAAS_API_KEY_PRODUCTION` não pode ter credencial LIVE |
| `jornalir-sistema` Preview | `ASAAS_WEBHOOK_TOKEN` | Token exclusivo do teste; não reutilizar o webhook real |
| Portal e painel Preview | `R2_*` | Bucket, conta e chave independentes do acervo real |
| `jornalir-sistema` Preview | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Desativados, ou credenciais de canal de testes com destinatários permitidos |

**Regra de aplicação:** `apps/sistema/src/lib/release/previewIsolationPolicy.ts` nega `service_role` no Preview por padrão. Só permite quando `IR_HOMOLOGATION_ENABLED=true` E a URL corresponde exatamente ao projeto sandbox identificado e diferente da Production. O webhook Asaas segue o mesmo gate e ainda exige `ASAAS_ENV=sandbox`. Mesmo com uma chave production acidental no Preview, não será aceita se o projeto/URL não passarem na verificação.

**Importante:** novas variáveis da Vercel não reconfiguram deployments antigos. Os Preview READY anteriores continuam protegidos por Vercel Authentication, porém segredos antigos potencialmente expostos devem ser rotacionados de forma controlada. Chaves do Asaas/Supabase que estiveram em Preview continuam em processo de rotação.

## Matriz de homologação: executar com evidências, não presumir com CI verde

| Bloco | Passo de teste | Evidência/aceite |
|---|---|---|
| A. Segurança/Auth | Signatário OTP externo sem acesso ao painel, usuário novo inativo, owner/admin/operador com permissão granular, convite, reenvio, recuperação e e-mail confirmado | Matriz por perfil; logs de auditoria sem dados pessoais |
| B. Clientes | Pessoa física e jurídica com CPF/CNPJ fictício, duplicação bloqueada, alteração de nome/endereço, vínculo a venda e assinatura | Um único cadastro mestre, sem dados reais |
| C. Comercial/Financeiro | Pedido/venda e contratos escolhidos pelo serviço, título, desconto, pagamento parcial, crédito, Pix Sandbox, webhook autenticado, cancelamento, duplicidade e estorno | Saldo consistente; operador nunca baixa/cancela sem permissão |
| D. Assinatura PDF | Minuta, aprovação, 1/2 signatários, OTP, documentos/reenvio e falha parcial | Evidências imutáveis e acessíveis apenas a partes autorizadas |
| E. Editorial | Rascunho, capa por estrela, recorte desktop, galeria, agendamento, publicação, redes, destaque e push de teste | Portal mostra apenas publicado; rascunho não vaza |
| F. Jornal Online | PDF com páginas, capa, OCR/importação para rascunho, download/range/caching no R2 sandbox, viewer desktop/mobile | Sem duplicidade; acervo real não alterado |
| G. Aniversariantes | Nome/dia/mês/ano opcional, instituição/CNPJ, `Novo +`, exclusão, PDF/relatório, atualização imediata | Sem itens duplicados e com layout aprovado |
| H. Agenda/Pauta | Convidados, aceite/recusa/pendência, lembretes e conclusão por responsável | Notificações apenas para teste, sem vazamento |
| I. Portal/UX | Abertura 2,5s + transição, títulos clicáveis, compartilhar WhatsApp/Facebook/Instagram/link, PC/mobile | Evidência visual e compartilhamento correto |
| J. Publicidade/Assine | Patrocinadores manuais gratuitos, ordem/rotação 6 posições, Assine/Anuncie ativáveis, sem vínculo financeiro ao bônus | Nenhum gatilho indevido de suspensão |
| K. Release | Logs, header/SEO, proteção de rotas, limites de upload, migrações, envs e rollback | Todos os bloqueios de produção resolvidos antes do GO |

## Regras de conclusão
- `npm ci` estrito, typechecks, builds, testes de políticas, `supabase db lint --local --schema public` obrigatório e banco efêmero CI **verdes no mesmo SHA final**.
- A matriz visual, os e-mails, o PIX Sandbox, o R2, os dispositivos e as configurações de domínio exigem **testes efetivos**, não só asserts de código.
- O histórico Supabase real (152 versions em 24/10) deve ser conciliado em backup/ensaio antes de migrar Production, pois 43 migrations novas e 3 aliases permanecem pendentes.
- Verificar proteção de senha vazada (Auth), funções `SECURITY DEFINER`, oito views públicas e credenciais antigas no Preview.
- **Homologado** significa testado e aceito em sandbox isolado; **Publicado** exige autorização adicional, backup e deploy separado. Nunca confundir estados.
