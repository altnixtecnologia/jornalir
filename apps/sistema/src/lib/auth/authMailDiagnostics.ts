/** Mensagens para falhas de envio do Auth. Não expõe endereços nem detalhes internos. */
export function describeAuthMailError(error:{
 message?:string;status?:number;code?:string;
}|null|undefined,operation:"invite"|"recovery"="invite"):string {
 const raw=(error?.message??"").toLowerCase();
 const code=(error?.code??"").toLowerCase();
 if(error?.status===429||raw.includes("rate limit")||code.includes("rate_limit"))
  return "Limite de e-mails do Supabase Auth atingido. Confira Auth > Rate Limits e a configuração SMTP. Nenhum recebimento foi confirmado.";
 if(raw.includes("email address not authorized")||raw.includes("email not authorized")||code.includes("email_address_not_authorized"))
  return "O SMTP padrão do Supabase não envia para este destinatário. Configure um SMTP próprio em Authentication > SMTP Settings antes de reenviar.";
 if(raw.includes("already")||raw.includes("registered")||raw.includes("exists"))
  return "O e-mail já possui conta no Auth. Consulte o status na lista; se houver convite pendente, use Reenviar acesso.";
 if(raw.includes("redirect")||raw.includes("not allowed")||raw.includes("url not allowed"))
  return "A URL de retorno do convite não está autorizada. Confira Authentication > URL Configuration e o endereço /definir-senha.";
 if(raw.includes("smtp")||raw.includes("sending")||raw.includes("mail"))
  return "Supabase Auth não conseguiu processar o envio. Verifique SMTP, domínio do remetente e logs de Auth.";
 return operation==="invite"
  ? "Convite recusado pelo Supabase Auth. Consulte Auth Logs, SMTP e URLs permitidas; o convite não foi confirmado."
  : "Recuperação recusada pelo Supabase Auth. Consulte Auth Logs, SMTP e limites de envio.";
}
