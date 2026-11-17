# Patrocinadores — permissões granulares (preparação de 17/11/2026)

## Objetivo aprovado
O operador deve poder manter as imagens dos patrocinadores no portal sem acesso a vendas, contratos, financeiro ou Configurações gerais. A biblioteca única e a esteira universal de 07/11 são preservadas.

## Diagnóstico real
- A URL antiga /sistema/configuracoes/patrocinadores é adminOnly pelo middleware.
- A página, todas as Server Actions e policies de site_ad_media/site_ad_slots dependiam de publicidade.vendas_editar.
- Para upload, a RLS de media_assets não permitia acesso com essa autorização dedicada.
- Qualquer funcionário ativo podia editar site_ad_settings diretamente via Data API, sem direito granular.
- Silas Alves constava como admin no perfil examinado em 16/11; NÃO alterar papel sem revisar conta/sessão correta.

## Código preparado
- Novo caminho operacional /sistema/patrocinadores reaproveitando os componentes e serviços existentes.
- Caminho de Configurações continua como link legado, redirecionando para a mesma biblioteca (não duplica telas/dados).
- Módulo 'patrocinadores', ação 'gerenciar', no painel de Usuários; habilitação manual dá acesso às imagens, mas não concede vendas.
- Excluído da opção de ativação de módulos em massa, evitando concessão inadvertida.
- Middleware e Server Actions verificam o novo módulo; consulta de mídia e escrita estão cobertas pela migration preparada.
- Menu do sistema e página inicial oferecem acesso ao operador com o módulo visível.

## SQL separado — NAO APLICADO
supabase/migrations/20261122341100_sponsor_operator_permissions.sql
Ampliar checks existentes para novo módulo e alterar políticas RLS de site_ad_media, site_ad_slots, site_ad_settings e media_assets. Nenhuma linha é migrada ou atualizada, nenhuma imagem muda de local.

## Homologação (necessária antes de produção)
1. Conferir diferença do schema e histórico de migrations atuais; validar SQL em banco descartável/ambiente de homologação.
2. Com conta operadora: sem módulo visível = acesso negado; visível sem ação = sem gravação; visível + gerenciar = upload/pausa/remoção.
3. Verificar que a conta só com patrocinadores NÃO acessa vendas, Comercial, Financeiro, Usuários nem Configurações.
4. Testar owner/admin e URL antiga, RLS de upload/consulta, a biblioteca única e o rodízio público sem regressão.
5. Pedir autorização específica para migration remota, depois deploy, depois concessão à conta correta.
6. Não acionar Asaas, NFS-e, e-mails, WhatsApp, movimentação financeira ou alterações de perfis reais.

STATUS: preparado no GitHub para revisão; ainda não publicado nem homologado com login real.
