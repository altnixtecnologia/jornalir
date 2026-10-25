import test from "node:test";
import assert from "node:assert/strict";
import {canEnterStaffPanel} from "../src/lib/auth/staffAccessPolicy";

const valid={authenticated:true,emailConfirmed:true,profileActive:true,
 role:"operator",databaseStaffApproved:true};
test("colaborador convidado e confirmado acessa painel",()=>{
 assert.equal(canEnterStaffPanel(valid),true);
 assert.equal(canEnterStaffPanel({...valid,role:"owner"}),true);
 assert.equal(canEnterStaffPanel({...valid,role:"admin"}),true);
});
test("convite pendente não abre rota interna mesmo com profile.active=true",()=>{
 assert.equal(canEnterStaffPanel({...valid,emailConfirmed:false}),false);
});
test("assinado externo via OTP não ganha painel apenas por auth.users/profile",()=>{
 assert.equal(canEnterStaffPanel({...valid,databaseStaffApproved:false}),false);
});
test("conta inativa, papel inesperado ou sessão ausente são negados",()=>{
 for(const change of [{profileActive:false},{role:"signer"},
   {authenticated:false},{role:null}]){
  assert.equal(canEnterStaffPanel({...valid,...change}),false);
 }
});
