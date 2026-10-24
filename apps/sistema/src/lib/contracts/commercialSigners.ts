export type CommercialSignerRole = "contratante" | "contratada" | "testemunha";
export interface CommercialSignerDraft {
  role: CommercialSignerRole;
  name: string;
  email: string;
  phone?: string;
}
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validação paralela à RPC: segurança final sempre revalidada no banco. */
export function normalizeCommercialSigners(
  entries:CommercialSignerDraft[],
):CommercialSignerDraft[] {
  if (!Array.isArray(entries) || entries.length<2 || entries.length>10) {
    throw new Error("Informe entre 2 e 10 signatários.");
  }
  const seen=new Set<string>();
  const output=entries.map(entry=>{
    const role=entry.role;
    const name=String(entry.name??"").trim().replace(/\s+/g," ");
    const email=String(entry.email??"").trim().toLowerCase();
    const phone=String(entry.phone??"").replace(/\D/g,"");
    if (!["contratante","contratada","testemunha"].includes(role) ||
        name.length<3 || name.length>180 || email.length>254 ||
        !emailPattern.test(email) || (phone && (phone.length<10 || phone.length>13))) {
      throw new Error("Confira papel, nome, e-mail e telefone de cada signatário.");
    }
    if(seen.has(email)) throw new Error("Não repita e-mails na mesma rodada.");
    seen.add(email);
    return {role,name,email,phone};
  });
  if(!output.some(row=>row.role==="contratante") ||
     !output.some(row=>row.role==="contratada")) {
    throw new Error("Informe pelo menos um representante de cada parte.");
  }
  return output;
}
