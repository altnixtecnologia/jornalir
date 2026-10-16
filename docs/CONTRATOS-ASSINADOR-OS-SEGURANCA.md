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

## Etapa de assinatura ainda não implementada

Uma integração real precisa de, no mínimo:

1. Emitir convite assinado com vínculo imutável de contrato, documento,
   signatário, prazo, propósito e permissões — sem compartilhar service-role.
2. Transferir PDF somente por link privado com expiração/uso controlado ou
   armazená-lo no mesmo backend autorizado; o projeto externo não recebe
   uma URL pública permanente do contrato.
3. Validar identidade e consentimento do signatário; registrar evidências
   com horário, hash SHA-256 do PDF original, método da assinatura e
   trilha de auditoria.
4. Gerar PDF final e vincular ao mesmo contrato/cliente, preservando os
   originais e impedindo sobregravação; oferecer reenvio por WhatsApp/e-mail
   com autorização explícita e histórico de entrega.
5. Definir modelos diferentes de contrato, ordem de signatários,
   cancelamentos e documentos que exigem certificado digital.

**Status:** arquivo PDF privado e fluxo documental já integrados neste lote;
assinatura eletrônica, envio para signatário e recuperação do PDF assinado
continuam pendentes. Não representar o projeto estático antigo como
assinatura já integrada.
