# Módulo 2 — Usuários, convites, permissões e SMTP

Data de revisão: 24/10/2026. Branch: `feature/homologacao-integrada-ir-20261023`. **Não é liberação de produção.**

## Requisitos conferidos

- O administrador cadastra nome verdadeiro, e-mail e papel; somente
  `owner` cadastra administrador.
- O perfil técnico de `auth.users` nasce `active=false` e não autoriza
  o painel por si só.
- A migration `20261119100000_staff_membership_authorization.sql` cria
  `staff_memberships` separado de contas externas de assinatura (comercial
  e institucional). Apenas Server Action autorizada com service_role inclui
  colaboradores após a solicitação de convite ao Auth.
- Os administradores acessam **somente** colaboradores na lista de usuários
  e nos status de convites; signatários externos não aparecem.
- `is_active_staff`, `is_active_admin_or_owner` e `is_active_admin`
  conferem membership + profile ativo + confirmação real de e-mail no Auth.
  `staff_can_see_module`, `staff_can_module_action` e
  `staff_can_finance_action` permanecem restritos, sem abrir ações extras.
- O middleware nega acesso quando as variáveis Auth não existem (503),
  valida e-mail confirmado e a RPC do banco. Conta pendente recebe
  `/login?erro=pendente`, sem loop de redirecionamento.
- `AuthProvider` revalida email e membership; operadores e signatários
  externos não recebem menus internos.
- Cadastro autorizado grava `profiles.name`, `role` e `active` na
  mesma atualização, depois do membership.
- Nome legado derivado do prefixo do e-mail é mostrado como
  `Nome não informado` e deve ser corrigido por administrador.
- Convites pendentes podem ser reenviados; isso não significa entregue.
  Alterações de senha usam link de recuperação, sem o administrador
  definir ou receber a senha.
- Desligar módulo remove menu e bloqueia URLs/RLS; operador só executa
  ação liberada. Financeiro permite separadamente gerar/enviar PIX e nega
  baixa/cancelamento sem concessão. Owners e admins conservam acesso total.
- A migration de membership recupera owner/admin e contas previamente
  convidadas pelo Auth. **Contas legadas de operador sem `invited_at`
  exigem revisão administrativa e inclusão assistida, nunca ativação
  automática de contas externas**.

## SMTP ainda depende de configuração externa

O Supabase Pro não ativa SMTP personalizado automaticamente. O serviço
padrão só envia a endereços autorizados da equipe e tem limites muito
baixos; não homologar convite com destino externo enquanto usar o SMTP
padrão.

No projeto Supabase correto (`site-system-ir`):
1. Authentication → SMTP Settings: escolher provedor, remetente e domínio
   verificado; configurar **sem inserir credenciais no GitHub**.
2. Verificar SPF, DKIM, DMARC e template de convite/recuperação.
3. Authentication → URL Configuration: Site URL em
   `https://controle.altnix.com.br` e redirects exatos para
   `/definir-senha` e `/definir-senha?recovery=1`.
4. Authentication → Rate Limits e Auth Logs: conferir erros de SMTP,
   limites, credenciais e recusas. As duas contas pendentes no registro
   histórico devem ser verificadas sem disparos repetidos.
5. Em **ambiente de homologação**, usar caixa postal de teste:
   convidar operador, receber o e-mail, abrir link, definir senha,
   confirmar Auth, acessar apenas módulo autorizado, negar financeiro
   restrito, recuperar senha, reenviar convite, revogar acesso e
   confirmar acesso negado.
6. Testar login direto com link vencido, e-mail não confirmado,
   signatário externo via OTP e perfil desativado.
7. Validar signatários comerciais por SMTP/OTP em ambiente de teste;
   não enviar links ou cobrar clientes reais sem homologação.

## Critérios de CI

`apps/sistema/test/staff-access-policy.test.ts` cobre ausência de Auth,
e-mail pendente, membro externo, perfil inativo, owner/admin/operador.
`tests/security/full-schema-rls-postflight.sql` verifica RLS,
permissões de membership e um signup adversarial com metadata falsificada
que recebe profile inativo e NÃO obtém staff membership mesmo se o
profile for forçado a ativo dentro de transação reversível.

Não aplicar migrations no Supabase remoto nem publicar na Vercel sem
autorização. Não sincronizar `main` nem VS Code local sem conferir
divergência de branches.

## Proteção do OTP externo sem desconexão indevida

`RootProviders` envolve o app inteiro, inclusive a rota pública de
assinaturas; **não** executar `auth.signOut()` automaticamente quando
um usuário autenticado não pertence a `staff_memberships`.
O `AuthProvider` marca o acesso interno como `inactive`, o
`AuthGate` bloqueia a UI e o middleware/RLS negam rotas
`/sistema/*` e `/agenda/*`, mas o signatário mantém sua sessão
Auth confirmada para completar `/assinar-contrato-comercial/:token`
e ver o PDF pelo endpoint que exige `verified_user_id`.

Checklist indispensável de homologação: signatário externo confirma OTP,
consegue visualizar/assinar PDF e receber status de conclusão; uma tentativa
de abrir o painel pela mesma sessão é negada. Administrador pode revogar
permissões sem derrubar sessões válidas de signatários.

## 24/10 — endurecimento de links Auth sem envio real

- Todos os fluxos de convite, reenvio e redefinição usam `staffAuthRedirectUrl`. Em produção somente `https://controle.altnix.com.br/definir-senha` e `?recovery=1` são aceitos; configurações com HTTP externo, domínio de preview, parâmetros, caminho ou credenciais são negadas **antes** de pedir e-mail ao Auth. Isso impede extravio do link de recuperação por configuração errada de `NEXT_PUBLIC_SISTEMA_URL`.
- Em ambiente local permite `http://localhost`/127.0.0.1; URLs públicas de desenvolvimento exigem HTTPS. Testes dedicados verificam os casos negativos.
- `UsersManager.handleInvite` agora limpa `pending` mesmo em falha da ação/rede e não confunde solicitação aceita pelo Auth com entrega confirmada.
- **Ainda obrigatório externamente:** configurar SMTP próprio, autenticar remetente, revisar URLs autorizadas no painel Supabase, testar convite real apenas com e-mail de homologação e conferir `email_confirmed_at`/logs/bounces. Não houve qualquer e-mail disparado por estas alterações.
