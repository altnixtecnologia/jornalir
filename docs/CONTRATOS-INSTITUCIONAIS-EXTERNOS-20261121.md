# Contratos institucionais redigidos externamente — cartório e guarda digital

Escopo: contratos institucionais existentes em Financeiro > Contratos, no repositório jornalir.

- Primeiro campo no cadastro/edição: "Contrato redigido fora do sistema" (prefeitura, Câmara, licitação, cartório ou outra entidade).
- Segundo campo na ficha do contrato: "Anexar contrato assinado em cartório" (PDF digitalizado de até 4 MB, após a assinatura).
- Usa institutional_contracts.extra_data.externallyDrafted (jsonb já existente) e contract_documents (tipo contract), com arquivo privado em contract-documents e download autenticado.
- Cada upload cria arquivo de nome aleatório; nenhuma cópia assinada é substituída.
- Contrato externo não abre gerador de modelos nem convites ou assinatura eletrônica no sistema. Guards também nas server actions e na leitura do PDF para preparar a assinatura pela empresa.
- Arquivamento não emite documento, não cria aceite eletrônico, comprovante, cobrança, liberação de serviços ou mensagens.
- Manter cadastros, valores, vigências, vínculos financeiros e outros documentos anteriores.
- A origem não pode ser alterada após haver convite ou rodada de assinatura eletrônica.
- Não há migração nova nem criação de tabelas; o histórico de documentos continua consultável na ficha.
- A homologação visual com usuário autenticado e PDF fictício fica pendente; não criar contratos reais automaticamente para testar.
