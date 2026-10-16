import { redirect } from "next/navigation";

// Legacy sponsors mock redirected to the actual persistent site ad slots manager.
export default function LegacyPatrocinadoresRedirect(): never {
  redirect("/sistema/configuracoes/patrocinadores");
}
