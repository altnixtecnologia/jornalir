# Integração Jornal IR ↔ assinador-os

Repositório de referência existente: `altnixtecnologia/assinador-os` (privado).
Revisão de 16/10/2026. Este documento explicita o que é efetivamente
integrado e evita tratar assinaturas simuladas como documentos assinados.

## Disponível neste lote

- `institutional_contracts` continua sendo o cadastro mestre do contrato.
- O assistente de criação aceita PDF real e grava em `storage.contract-documents`
  privado; `contract_documents.file_reference` contém o caminho exato dos
  bytes armazenados.
- Anexos de contratos existentes usam o mesmo armazenamento privado.
- Download passa por `/api/financeiro/contratos/[id]/documentos/[documentId]`;
  apenas após confirmar sessão, acesso financeiro, vínculo do arquivo e
  URL assinada de 90 segundos.
- O módulo NFS-e é independente de contratos e continua bloqueando qualquer
  transmissão fiscal sem homologação, sem criar notas fictícias.

## Diferenças que impedem copiar o assinador antigo diretamente

- `assinador-os/js/config.js` aponta para **outro Supabase**, com
  gerenciamento de usuários, tabelas `documentos`/`assinaturas` e fluxo
  de funções próprios; é um produto separado.
- O visualizador do assinador atual usa `getPublicUrl()` para o PDF original.
  Documentos contratuais do Jornal IR não devem ser publicados nesse modelo.
- A função `salvar-assinatura` do projeto externo não está integrada ao
  contexto de autorização, contrato e cliente do Jornal IR.
- Uma imagem manuscrita capturada em canvas não pode ser divulgada como
  assinatura digital ICP-Brasil sem os requisitos legais correspondentes.

## Fluxo de assinatura eletrônica integrado na branch (ainda não publicado)

- `contract_signature_invitations`: convites com token criptográfico de 256 bits.
  Só o hash SHA-256 é salvo no banco; expiração em 7 dias e revogação.
- O operador do Financeiro escolhe PDF, nome, e-mail e WhatsApp.
  O convite é mostrado uma única vez para compartilhamento manual ou,
  **somente após consentimento explícito de contato**, enviado por
  template Meta `WHATSAPP_SIGNATURE_INVITE_TEMPLATE`, se cadastrado e aprovado.
  `accepted_by_meta` significa **aceito pela API**, não entregue/lido.
- Convites expirados/revogados podem ser substituídos por **novo link**,
  sem recuperar ou reativar o token anterior.
- O signatário confere o PDF original por link privado, confirma seu
  e-mail via OTP de Supabase Auth, informa o nome e desenha a assinatura.
  O servidor valida a sessão de e-mail antes de qualquer finalização.
- **Configuração operacional obrigatória do e-mail Supabase:** o template
  de login por e-mail deve conter o token `{{ .Token }}` (6 dígitos);
  se enviar apenas link mágico, configurar esse template no Auth antes
  de usar a assinatura. A entrega e o limite de e-mails são operados
  pelo Supabase Auth; nenhum envio real foi homologado.
- `handle_new_auth_user` marca signatários externos criados via Auth
  `account_purpose=contract_signer` como `profiles.active=false`.
  O acesso ao painel requer colaborador ativo e não é herdado da
  mera verificação do e-mail de assinatura.
- A versão consolidada do **próprio PDF** inclui todas as páginas
  originais e **mais uma folha final** com assinatura gráfica, data,
  hash do original e identificação do convite (`pdf-lib`).
  O arquivo original continua imutável em Storage; uma segunda
  cópia, o comprovante independente, também é armazenada.
- `finalize_contract_signature`: RPC transacional de uso único; grava
  a versão com folha de assinatura, o comprovante e os hashes, sem
  regravar o original. Nenhum papel público ou `authenticated`
  pode executar a RPC diretamente.
- Bucket `contract-signatures` privado; logs com horário UTC, hash do
  IP fornecido pelo proxy e user-agent. Não comprova assinatura digital
  **qualificada ICP-Brasil** ou identidade civil além do e-mail verificado.

## Etapa complementar ainda necessária

Antes da homologação final, continuam necessários:

1. Teste E2E com contrato e e-mail de teste (incluindo template Auth com
   `{{ .Token }}`, confirmação do OTP, anexos, PDF consolidado e comprovante).
2. Configurar `WHATSAPP_SIGNATURE_INVITE_TEMPLATE` e aprová-lo na Meta,
   com três parâmetros (nome, contrato, link). Sem isso, apenas
   compartilhamento manual. E-mail de convite automatizado exige
   um provedor transacional verificado; `mailto:` é só preparo manual.
3. Confirmar se casos do jornal necessitam assinatura qualificada
   ICP-Brasil/PAdES; a folha de aceite eletrônico não substitui isso.
4. Modelos de contratos por caso, múltiplos signatários, ordem e posição
   de assinatura, caso haja exigência além de uma assinatura por convite.
5. Implementar webhook de status Meta se for necessário diferenciar
   aceite de entrega/leitura. O status atual não promete isso.
6. Publicar na Vercel quando liberar a cota e validar com login real.

**Status:** fluxo de assinatura eletrônica com convite, OTP, PDF
consolidado, comprovante, auditoria e reemissão por novo token implementado
na branch, **não homologado nem publicado**. NFS-e real continua bloqueada:
não há configuração fiscal, certificado do prestador, nem homologação da
API nacional. Não tratar código preparado como produção habilitada.
