/** Elegibilidade antes de abrir qualquer rota administrativa.
 * O middleware também consulta a RPC is_active_staff, que confirma
 * no banco o perfil e email_confirmed_at. Falha fechada por padrão.
 */
export function canEnterStaffPanel(input:{
 authenticated:boolean;
 emailConfirmed:boolean;
 profileActive:boolean;
 role:string|null;
 databaseStaffApproved:boolean;
}):boolean {
 return input.authenticated && input.emailConfirmed && input.profileActive
  && ["owner","admin","operator"].includes(input.role??"")
  && input.databaseStaffApproved;
}
