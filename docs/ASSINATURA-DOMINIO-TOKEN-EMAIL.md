# Serviço de assinatura de documentos: domínio, e-mail e token (planejamento)

- Endereço preferido: `assinar.informativoregional.net`. Configurar DNS e projeto web público isolado, sem usar o endereço do sistema administrativo.
- E-mail de assinatura sai do Jornal IR; `reply-to` configurável de atendimento. Não enviar se o destinatário não estiver verificado ou for inconsistente com cadastro. Salvar apenas endereço mascarado nos registros de tentativa.
- Cada convite terá token aleatório gerado por `crypto.randomBytes(32)`; guardar exclusivamente `sha256(token)` na tabela privada de signatários; expirar e revogar; índice exclusivo.
- Evitar deixar token em logs, URLs de ferramentas analíticas, Referer de terceiros; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, headers defensivos e sem scripts externos na tela de assinatura.
- Ao abrir o link, identificar o signatário e exigir verificação adicional por canal registrado (OTP rate limited). Nunca confiar em CPF digitado no navegador como validação de identidade.
- Reenvio de convite pendente cria token novo e revoga anterior; reenvio de documento concluído envia acesso somente ao PDF assinado e evidência preservada, **não gera outra assinatura**.
- Painel cliente: status, arquivo original, final assinado, evidência, data, reenvios. Histórico de tentativas independente do documento assinado.
- Botões de envio permanecem indisponíveis até engine revisada, templates aprovados, configuração de remetente SMTP/API e testes de entrega. A conexão atual não autoriza auditar a função `salvar-assinatura` do Supabase do assinador antigo; não usar a função em produção sem revisão.
