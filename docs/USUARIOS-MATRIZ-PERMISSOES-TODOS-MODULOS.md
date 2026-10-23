# Sistema IR — matriz granular de permissões por usuário

**Status:** somente PR #12 (branch `feature/usuarios-convites-permissoes-20261022`). **NÃO publicar sem homologar RLS.**

## Princípios

- Proprietário e Administrador: acesso integral.
- Operador: módulo visível/conferível SOMENTE se `staff_module_visibility.enabled`; as ações internas são concedidas UMA a UMA, **negadas por padrão**.
- **Visualizar NÃO concede criar/editar/excluir/cancelar/baixar/estornar/publicar/enviar/exportar.** Não é suficiente esconder botão: Server Actions, rotas API, RPCs e Supabase RLS devem aplicar o mesmo direito.
- `staff_finance_action_permissions`: mantém 17 direitos do Financeiro separados. Contratos institucionais permanecem dentro desta matriz neste estágio.
- `staff_module_action_permissions`: nova tabela com 26 direitos de Editorial, Clientes, Assinaturas, Comercial, NFS-e e Aniversariantes (migration `20261102100000_staff_module_action_permissions.sql`).
- Agenda/Pauta: regras diferenciadas já existentes de leitura, responsável, organização e administradores autorizados. Não duplicar as permissões na tabela genérica.
- Operador desativado ou convite pendente sem aceite não deve ser tratado como usuário ativo. Situação do convite é consultada via Supabase Auth.
- Sempre registrar auditoria das concessões e revogações. Mudanças de permissão devem surtir efeito nas próximas requisições, sem depender do cache do menu.

## Interface

Na listagem Usuários, **Editar permissões** abre apenas os controles do usuário selecionado:
visibilidade por módulo, ações específicas de cada módulo, ações detalhadas
do Financeiro; ações sem concessão ficam desmarcadas. A visibilidade deve ser
condição necessária, mas não suficiente, para cada operação.

### Módulos previstos
- Editorial / Matérias: criar, editar, publicar/agendar, arquivar, mídias e edições.
- Clientes: cadastrar e editar; arquivamento/exclusão apenas se implementado com histórico.
- Assinaturas: contratar, editar, suspender/reativar, cancelar; cobranças requerem Financeiro em separado.
- Comercial/LED: produtos, propostas, aprovação, vendas e cancelamento; operações financeiras/NFS-e acumulam as autorizações de seus módulos.
- Aniversariantes: cadastro/edição/retirada e mensagens/modelos.
- NFS-e: rascunhos, emissão, cancelamento e configurações; normas fiscais e certificado continuam restritos até revisão especializada.
- Financeiro: 17 ações já definidas no banco, não apenas acesso ao menu.
- Agenda/Pauta: permissões existentes e participação por responsável.
- Contratos e locação: hoje Financeiro + Comercial; futuramente permissões específicas de geração, envio, assinatura e cancelamento, incluindo inventário de equipamentos.

## Bloqueadores obrigatórios antes de merge/deploy

1. **Auditar e corrigir a RLS de CADA tabela associada**: políticas antigas `is_active_staff()` podem permitir acesso direto ao banco, burlando o menu/Server Actions. Combinações permissivas de políticas SELECT/INSERT/UPDATE exigem atenção.
2. Catalogar e cobrir todos os caminhos: Server Actions, API routes, RPCs, upload/storage, edições e jobs. A primeira rodada aplicou guardas a operações centrais, mas não cobre TODOS os endpoints ainda.
3. Homologar cada ação com diferentes operadores e cliente PostgREST direto; testar negação real, não só botão oculto. Testar também o efeito do módulo desabilitado.
4. Regras diferenciadas: publicar sem criar, dar baixa sem editar, emitir NFS-e sem gerir certificado, aceitar um convite sem ativar permissão de outro usuário.
5. Regras de financeiro e NFS-e com acesso do Asaas/serviços devem continuar operando sob autenticação própria. Não usar service_role no navegador.
6. Migração e ordem correta (banco seguro antes de frontend), backup, testes de regressão e auditoria.
7. Layout Usuários: TD não pode conter `display:block` da classe `materia-title` (desalinhava colunas no desktop). Verificar responsividade e botões em 360/768/desktop.

**Não confundir criação da matriz no banco com autorização efetiva em todas as rotas.**
