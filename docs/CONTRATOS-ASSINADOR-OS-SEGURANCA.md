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

- `contract_signature_invitations`: convites com token aleatório de 256 bits;
  só o hash SHA-256 fica no banco. Expiração em 7 dias e revogação.
- O operador do Financeiro escolhe PDF, nome, e-mail e WhatsApp e recebe
  o link privado uma única vez. O compartilhamento por WhatsApp ou e-mail
  é **manual**, aberto no aplicativo do operador; não há envio automático
  configurado, confirmação de leitura ou reenvio do mesmo token.
- `/assinar-contrato/[token]`: lê PDF original de storage privado,
  exige nome e e-mail iguais aos do convite, aceite expresso e desenho da
  assinatura. A mera posse do link **não é uma prova de identidade forte**:
  OTP ou validação adicional são pendências.
- `finalize_contract_signature`: RPC atômica de uso único, chamada
  com service_role somente. Revogados, expirados e já assinados bloqueados.
- Evidência JPEG, hash do PDF original, data/hora, consentimento, IP em hash
  (quando fornecido pelo proxy) e user-agent limitado no registro privado.
- Um **PDF de comprovante separado** é gerado no servidor e vinculado ao
  contrato. Original mantido sem modificações, não se afirma assinatura
  digital qualificada ou ICP-Brasil. Não substitui a necessidade de gerar
  uma versão consolidada/assinada do próprio PDF em fluxos que a exijam.
- Bucket `contract-signatures` privado, sem políticas de leitura para
  usuários comuns; somente backend administrativo.

## Etapa complementar ainda necessária

Para equiparar a experiência avançada do assinador antigo, falta:

1. Comprovação reforçada de identidade do signatário (por e-mail/OTP ou
   método equivalente); o link de posse única não faz essa validação sozinho.
2. Gerar versão consolidada do PDF original com a assinatura visível e
   verificável, sem apagar nem alterar o original; preservar os dois hashes.
3. Envio automático com template autorizado na Meta ou provedor de e-mail,
   com registro de entrega e consentimento, quando credenciais aprovadas
   estiverem disponíveis. Por ora, compartilhar manualmente.
4. Modelos por tipo de contrato, múltiplos signatários, ordem de assinatura,
   posição da assinatura e reenvio de convites expirados mediante novo token.
5. Testes de ponta a ponta usando contrato e signatário de teste; a base de
   produção continua sem contratos, documentos ou convites cadastrados.

**Status:** fluxo próprio de aceite, assinatura gráfica, auditoria e
comprovante separado implementado no código. Falta homologação com uma
assinatura real de teste, versão consolidada do PDF, envio automático e
publicação na Vercel. Nunca confundir o comprovante com PDF qualificado
ou o produto estático `assinador-os` com integração ao seu banco antigo.
