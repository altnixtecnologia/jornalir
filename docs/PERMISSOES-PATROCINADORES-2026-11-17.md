# Permissões da seção Configurações para operadores — revisão 17/11/2026

## Pedido
Na área **Usuários → Editar permissões** não existia a seção Configurações, impedindo o administrador de marcar/desmarcar seu acesso. A primeira implementação do PR #108 havia criado um módulo isolado de Patrocinadores; esta revisão o organiza dentro de **Configurações**, como solicitado.

## Sem abrir outras opções inadvertidamente
- **Configurações** aparece no catálogo de módulos, com liga/desliga por operador.
- Dentro desse módulo: **Patrocinadores do site — enviar, editar, pausar e remover imagens** e **Valores da página Assine — alterar preços, descontos e disponibilidade da página**. Ambas desmarcadas até concessão expressa; a segunda é crítica e exige confirmação em modal antes de ser incluída no rascunho.
- Ativar só o módulo Configurações não libera nenhuma ação; "Ativar módulos (padrão)" não ativa Configurações. "Selecionar tudo" não inclui ações críticas sem confirmação.
- Permissão de patrocinadores continua independente de **Comercial / editar vendas**.
- **Modelos de contratos** usa a permissão financeira `contratos_editar` já existente e não recebe autorização nova por meio de Configurações.
- **Auditoria e Atividades** mantém a autorização pré-existente `can_read_audit_log`; não recebe autorização por ativar Configurações.
- **Usuários, Dados da empresa, Asaas/cobranças, Notificações push, Aplicativo/APK, TV Pauta e Assistente IR** continuam restritos aos perfis atuais. Em especial, **a administração de Usuários é exclusiva de owner/admin**, independentemente da seleção em Configurações.
- **Valores Assine** agora exige a ação `configuracoes/valores_assine_gerenciar` na página, nas duas Server Actions e na policy `site_offer_settings_staff_update`. O antigo UPDATE amplo de qualquer funcionário ativo será restringido após a migration.
- O middleware libera para operadores APENAS o índice Configurações, a URL legada de Patrocinadores, Valores Assine e Modelos de contratos (com guarda financeira adicional). Qualquer nova subrota de Configurações é bloqueada para operadores por padrão. O caminho de Auditoria só aceita o `can_read_audit_log` específico.
- O índice Configurações exibe apenas links com permissão real; menus desktop/mobile mostram o acesso ao índice somente quando o módulo estiver ligado.
- **Confirmação de responsabilidade**: a interface de Usuários mostra o nome da ação crítica e solicita confirmação expressa de quem libera. A concessão só se efetiva após `Salvar permissões`. Já existe trigger `staff_module_action_permissions_audit` em produção que grava `auth.uid()`, módulo, ação e concessão/revogação na tabela `audit_events`; aproveitamos o log existente, sem duplicá-lo.

## Código/banco
- Reutiliza a biblioteca única existente e a esteira do site, sem tabelas novas.
- Guard da página e Server Actions: `configuracoes/patrocinadores_gerenciar` e `configuracoes/valores_assine_gerenciar`.
- Migration de RLS preparada em `supabase/migrations/20261122341100_sponsor_operator_permissions.sql`, ainda **NÃO aplicada**: amplia constraints de catálogo e troca direitos de escrita de site_ad_*, media_assets e site_offer_settings. Nenhuma imagem, usuário ou conteúdo é modificado.
- Nova rota operacional `/sistema/patrocinadores` e redirecionamento da URL em Configurações continuam compatíveis.

## Homologar antes de produção
1. Testar CI com testes unitários, TypeScript e build; revisar migrations reais e a whitelist de Configurações.
2. Preparar teste isolado do SQL antes de executar no Supabase oficial; confirmar RLS de owner/admin, operador sem módulo, com módulo sem ação e com ação.
3. Testar navegação por menu, por URL direta e as áreas administrativas proibidas, sobretudo que operadores não conseguem abrir `/sistema/usuarios` ou chamar ações de administração.
4. Testar upload real/pausa/remoção e a edição de valores Assine com conta de teste e confirmação explícita; sem alterar imagens oficiais ou preços reais, e sem acionar Asaas/NFS-e.
5. Exige autorização específica para migration remota e deploy, somente depois realizar concessões a operadores reais.
6. O cadastro examinado de Silas Alves constava `admin`; não alterar papel ou permissões existentes sem identificar a sessão.

**Estado: PR #108 rascunho, não publicado.**