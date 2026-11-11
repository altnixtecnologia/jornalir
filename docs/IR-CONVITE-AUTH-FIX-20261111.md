# IR Controle — correção de convites de acesso (11/11/2026)

## Diagnóstico, sem expor tokens

- `Site URL` do Supabase apontava para `https://controle.altnix.com.br` e a allow-list incluía `/auth/confirm`, `/definir-senha` e `/definir-senha?recovery=1`.
- O template `Invite user` recebido do administrador já usava `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. O escape HTML `&amp;` é correto, não substituí-lo por `ConfirmationURL` sem ajustar o destino.
- Na investigação, o Auth confirmou o convite (HTTP 200) e em seguida registrou uma segunda verificação (HTTP 403); o IR Controle registrou `verifyOtp falhou: otp_expired`. O link foi consumido antes da segunda verificação.
- Não é possível afirmar a origem da primeira visita apenas com esses logs: pode ter sido pré-visualização/antivírus do e-mail, ou navegação repetida.
- A confirmação da conta deve ser mantida. Não excluir o perfil nem recriar permissões; após corrigir o fluxo, recuperar senha se necessário.

## Mudança preparada nesta branch

- O `GET /auth/confirm?token_hash=...&type=invite|recovery` **não chama verifyOtp**: mostra uma tela de confirmação.
- Somente o **POST** disparado pelo botão consome o token, reduzindo o risco de scanners de links e pré-visualizações o utilizarem sem ação humana.
- Validar a origem dos POSTs, não incluir tokens em logs/redirecionamentos, resposta `no-store` / `Referrer-Policy: no-referrer`, tipos de token e destinos restritos.
- Usa o mesmo Supabase SSR com sessão autenticada em cookies e mantém a tela `/definir-senha` existente.
- Nenhum ajuste de cadastro, permissões, RLS, SMTP, URL global ou sistema público.

## Pendências operacionais

1. Configurar em Supabase > Authentication > Email Templates > Invite user o **Subject** próprio, por exemplo `Convite de acesso ao Sistema IR Controle | Informativo Regional`. O HTML `<title>` não altera o assunto da mensagem.
2. Conferir **Reset Password**: se utiliza `{{ .ConfirmationURL }}`, validar se o formato é compatível com a rota atual. Se necessário, alterar apenas esse template com aprovação.
3. Testar convite novo com e-mail de homologação sem scanners automáticos; testar abertura, botão de confirmação, sessão, senha e acesso ao painel. Testar também recuperação de uma conta já confirmada.
4. Só depois aprovar merge/deploy, confirmando que nenhuma funcionalidade do portal ou login preexistente regressou.

**Status:** correção em branch separada; sem deploy ou alteração no Supabase.
