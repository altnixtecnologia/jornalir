# Usuários / Convites — diagnóstico e checklist para homologação

**Status em 23/10/2026:** Código ajustado na PR #15; NÃO publicado, nenhum reenvio real efetuado nesta etapa.

## Diagnóstico sem expor dados pessoais

Consulta agregada, somente leitura, no Supabase real:

- 3 contas no Auth; 2 contas convidadas, ainda sem `email_confirmed_at`.
- Os 2 perfis pendentes têm `profiles.active=true` por padrão do trigger. Isso **não** comprova ativação: a migration `20261103100000_confirmed_staff_authorization.sql` bloqueia autorização até confirmar e-mail.
- 2 perfis usam o prefixo do e-mail como nome, porque o convite anterior omitia `raw_user_meta_data.name`.
- Logs do Auth registram pelo menos um `/invite` com HTTP 200 e `mail.send`; isto mostra requisição aceita e tentativa de entrega, não recebimento na caixa postal.

## Ajustes de código na PR

1. O convite agora exige **nome real, e-mail e perfil**; envia `data:{name}` à Admin API e valida o valor em `profiles.name`.
2. Há **Editar nome** para administradores autorizados, em desktop e celular, sem alterar e-mail, role, estado de ativação ou permissões.
3. Na lista, `Convite pendente` precede `Ativo`, verificando `auth.users.email_confirmed_at`. A tabela não deve chamar conta pendente de ativa pelo simples `profiles.active=true`.
4. `Reenviar acesso` aparece somente para usuários ainda não confirmados. Tenta novo convite do Supabase Auth; se a API rejeitar por conta já registrada, pede e-mail de recuperação, redirecionado à mesma tela de definir senha. Não gera link público nem confirma conta por força.
5. Mensagens deixam de prometer **entrega**. Resposta de API indica apenas aceitação pelo serviço de e-mail.

## Infraestrutura obrigatória — SMTP do Supabase

A chave Vercel `SUPABASE_SERVICE_ROLE_KEY` habilita a Admin API, mas **não configura SMTP**. Confirmar no dashboard:

- Projeto: https://supabase.com/dashboard/project/iqnzrpdccecgalqboeyf
- **Authentication > Emails > SMTP Settings**: usar provedor SMTP transacional próprio, host/porta/usuário/senha, remetente de domínio autenticado e nome de remetente Informativo Regional.
- **Authentication > URL Configuration**: Site URL da aplicação e redirects permitindo `https://controle.altnix.com.br/definir-senha` e `https://controle.altnix.com.br/definir-senha?recovery=1`, além do callback de Auth já utilizado pelo sistema.
- **Authentication > Email Templates > Invite user e Reset password**: revisar `{{ .ConfirmationURL }}` e destino da página; não enviar tokens ao navegador de quem administra.
- **Authentication > Rate Limits**: configurar limite apropriado ao provedor. O SMTP padrão do Supabase é restrito a destinatários da equipe do projeto, com limite pequeno, não serve para enviar convites reais.
- Confirmar SPF/DKIM/DMARC e logs de entrega/bounce no serviço SMTP; `mail.send` no Auth não confirma que o destinatário recebeu.
- Homologar com um e-mail de teste autorizado: convidar com nome completo, receber, clicar, escolher senha, verificar `email_confirmed_at`, acesso mínimo de operador e ativação visual; depois testar reenvio e link expirado.

**Não habilitar manualmente `email_confirmed_at`, não marcar como confirmado por SQL e não divulgar tokens de recuperação.** A operação real de entrega só pode ser comprovada com a infraestrutura SMTP configurada e um teste de recebimento.
