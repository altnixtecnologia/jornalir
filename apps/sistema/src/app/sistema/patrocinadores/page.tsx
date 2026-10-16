import { redirect } from "next/navigation";

/** Rota legada: evita exibir a antiga demonstração com dados temporários. */
export default function LegacyRedirectPage(): never {
  redirect("/sistema/configuracoes/patrocinadores");
}
