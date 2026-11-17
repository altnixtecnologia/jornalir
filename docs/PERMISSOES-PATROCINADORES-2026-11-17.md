# Permissões da seção Configurações para operadores — revisão 17/11/2026

## Pedido
Na área **Usuários → Editar permissões** não existia a seção Configurações, impedindo o administrador de marcar/desmarcar seu acesso. A primeira implementação do PR #108 havia criado um módulo isolado de Patrocinadores; esta revisão o organiza dentro de **Configurações**, como solicitado.

## Sem abrir outras opções inadvertidamente
- **Configurações** aparece no catálogo de módulos, com liga/desliga por operador.
- Dentro desse módulo: opção **Patrocinadores do site — enviar, editar, pausar e remover imagens**, desmarcada até concessão expressa. Ativar só o módulo Configurações não libera as imagens; "Ativar módulos (padrão)" não ativa Configurações.
- Permissão de patrocinadores continua independente de **Comercial / editar vendas**.
- **Modelos de contratos** usa a permissão financeira `contratos_editar` já existente e não recebe autorização nova por meio de Configurações.
- **Auditoria e Atividades** mantém a autorização pré-existente `can_read_audit_log`; não recebe autorização por ativar Configurações.
- **Usuários, Dados da empresa, Asaas/cobranças, Notificações push, Aplicativo/APK, TV Pauta, Valores Assine e Assistente IR** continuam restritos aos perfis atuais; não criar switches que não tenham segurança de backend/RLS completa.
- O middleware libera para operadores APENAS o índice Configurações, a URL legada de Patrocinadores e Modelos de contratos (com guarda financeira adicional). Qualquer nova subrota de Configurações é bloqueada para operadores por padrão. O caminho de Auditoria só aceita o `can_read_audit_log` específico.
- O índice Configurações exibe apenas links com permissão real; menus desktop/mobile mostram o acesso ao índice somente quando o módulo estiver ligado.

## Código/banco
- Reutiliza a biblioteca única existente e a esteira do site, sem tabelas novas.
- Guard da página e Server Actions: `configuracoes/patrocinadores_gerenciar`.
- Migration de RLS preparada em `supabase/migrations/20261122341100_sponsor_operator_permissions.sql`, ainda **NÃO aplicada**: amplia constraints de catálogo e troca direitos de escrita de site_ad_* e media_assets. Nenhuma imagem, usuário ou conteúdo é modificado.
- Nova rota operacional `/sistema/patrocinadores` e redirecionamento da URL em Configurações continuam compatíveis.

## Homologar antes de produção
1. Testar CI com testes unitários, TypeScript e build; revisar migrations reais e a whitelist de Configurações.
2. Preparar teste isolado do SQL antes de executar no Supabase oficial; confirmar RLS de owner/admin, operador sem módulo, com módulo sem ação e com ação.
3. Testar navegação por menu, por URL direta e as áreas administrativas proibidas.
4. Testar upload real/pausa/remoção com conta de teste, sem alterar imagens oficiais e sem acionar Asaas/NFS-e.
5. Exige autorização específica para migration remota e deploy, somente depois realizar concessões a operadores reais.
6. O cadastro examinado de Silas Alves constava `admin`; não alterar papel ou permissões existentes sem identificar a sessão.

**Estado: PR #108 rascunho, não publicado.**