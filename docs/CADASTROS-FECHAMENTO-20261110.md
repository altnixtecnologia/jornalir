# Módulo Cadastros — fechamento técnico iniciado em 10/11/2026

## Decisões preservadas

- Cadastro mestre único do Jornal IR em public.clients; finance/contratos/assinaturas
  referenciam o mesmo client_id. Não criar outro cadastro nem outra base de CPF/CNPJ.
- Altnix Informativo independente: nenhuma leitura/gravação remota, sincronização,
  suspensão de mídia ou permissão de exibição neste lote.
- Aniversariantes editoriais separados da ficha cadastral. Nascimento e fundação
  continuam na identidade do cliente; vincular aniversário editorial exige ação
  humana, sem alteração de consentimentos, fotos ou histórico.
- Familiais/pessoas vinculadas só são criados na ficha persistente do cliente;
  removido formulário "preview" que perdia as pessoas ao sair da página.
- Não executar emissões NFS-e, cobranças, envios de WhatsApp ou alterações
  de documentos já assinados a partir de alterações do cadastro.

## Campos e legislação

- CNPJ alfanumérico (Receita Federal, 31/07/2026): 12 posições A-Z/0-9 e
  DVs numéricos nas duas últimas; módulo 11 usando ASCII - 48.
  Formato numérico histórico preservado. Índice único existente continua.
- Dados fiscais preexistentes no mestre e no save_client: fiscal_email
  (opcional, com fallback a email), municipal_registration (PJ), icms_status
  (PJ opcional), address_ibge_code (PF/PJ opcional, auto do CEP).
- IBS/CBS e especificidades de tributação pertencem ao serviço e ao
  documento de emissão fiscal, não ao cliente. NFS-e permanece desativada
  até homologação fiscal distinta. Integrações Asaas/SEFIN devem ser
  testadas com formato alfanumérico antes de transmissão real.

## Lista de cadastros

- Busca, tipo, papel e status com filtragem paginada no servidor;
  alias role_match para preservar a lista de TODOS os papéis do cliente.
- Ordenação por referência, nome (chave calculada), CPF/CNPJ e status,
  ASC/DESC com desempate estável pelo ID; filtros preservados ao paginar.
- Campos fiscais são opcionais: não exigir identificadores ou tributos
  irrelevantes à pessoa e ao tipo de operação.

## Critérios de homologação

- Criar/editar PF e PJ, CNPJ numérico e alfanumérico, CPF/CNPJ duplicado.
- Validar todos os filtros, contagem exata, ordenação e paginação em PC/mobile.
- Confirmar dados fiscais persistidos sem modificar aniversariantes,
  assinaturas, contratos, cobranças ou histórico.
- Testar autorização de dono, admin, operador (criar/editar negado) e
  acesso direto à RPC save_client. Não basta esconder botões.
- Não considerar módulo concluído até teste autenticado no sistema oficial.
