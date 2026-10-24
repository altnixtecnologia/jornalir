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


## Bloco validado em 23/10 — RLS de Clientes/Assinaturas/Comercial

Migrations preparadas (ainda **NÃO aplicadas no Supabase de produção**):

1. `20261104100000_nonfinancial_module_action_rls.sql`:
   substitui SELECT/INSERT/UPDATE/DELETE permissivos antigos em
   `clients`, `client_roles`, `subscriptions`, `commercial_products`,
   `commercial_proposals`, `commercial_proposal_items` e `commercial_sales`.
   Acesso de leitura de clientes é permitido por módulos relacionados que
   legitimamente dependem do cadastro único (Assinaturas, Comercial, Financeiro,
   NFS-e), sem permitir alteração cadastral.
2. `20261104101000_save_client_action_guard.sql`:
   corrige autorização da RPC `save_client` (SECURITY DEFINER);
   a criação exige `clientes_criar` e a edição exige `clientes_editar`.
   Chamadas de serviço têm exceção explícita pela função original de integração.
3. Triggers de transições: valores/datas de assinatura não podem ser alterados
   com mera permissão de suspensão; uma proposta aprovada não retrocede para
   rascunho; uma venda cancelada não reativa. O catálogo de produtos permanece
   acessível para consulta às áreas relacionadas, mas sua manutenção exige
   `produtos_gerenciar`.
4. Os itens da proposta usam lock consultivo transacional no mesmo identificador
   da aprovação, para evitar corrida entre mudar status e alterar itens.
5. Inserção de `client_roles` por Assinaturas só autoriza papel `assinante`;
   Vendas/Comercial só autoriza `anunciante`; gestores de Clientes podem
   atribuir os demais papéis previstos.

**Teste automatizado:** o workflow `Finance RLS sandbox` foi ampliado para
rodar `module-rls-sandbox-setup.sql` e
`module-rls-sandbox-assertions.sql` num PostgreSQL temporário. Simula
operadores diferentes com apenas criação de clientes, assinatura, aprovação
de propostas ou cancelamento de vendas, além de convite não confirmado,
módulo oculto e proprietário. Nenhum registro da produção é alterado.

### Homologação ainda obrigatória

- Testar as migrations em projeto/branch Supabase de homologação com o esquema
  completo, incluindo triggers existentes `save_client`, promoção automática
  de papel `assinante`/`anunciante`, cobrança de assinatura, conversão de
  propostas e rotas de leitura do Financeiro/NFS-e.
- Auditar e restringir também as RLS de Editorial, mídias, NFS-e e
  Aniversariantes; os guards de Server Actions não substituem RLS.
- Verificar com usuário real que nenhuma função, view, Storage policy
  ou RPC exposta permite contornar a permissão escolhida na tela.
- Garantir compatibilidade entre esta PR e a PR #11 de contratações
  combinadas/locação antes do merge; aplicar migrações antes do novo frontend.
- Não publicar novos controles de permissões antes de homologação e revisão
  de rotas e automações. Admin/proprietário continuam com acesso integral.
